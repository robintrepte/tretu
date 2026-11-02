import { oauthProvider } from "@better-auth/oauth-provider"
import { passkey } from "@better-auth/passkey"
import { getCurrentAuthEndpointContext } from "@better-auth/core/context"
import { betterAuth, type BetterAuthPlugin } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware, getOAuthState, getSessionFromCtx, isAPIError } from "better-auth/api"
import { deleteSessionCookie } from "better-auth/cookies"
import { symmetricDecrypt } from "better-auth/crypto"
import { nextCookies } from "better-auth/next-js"
import { captcha, jwt, magicLink, twoFactor, username } from "better-auth/plugins"
import { and, eq, ne, or, sql } from "drizzle-orm"
import type { AppleOptions, AppleProfile } from "@better-auth/core/social-providers"
import { base32 } from "@better-auth/utils/base32"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { localeFromHeaders, type Locale } from "@/i18n/locales"
import { ACCOUNT_LOCKED, activeLock, revokeAllAccess } from "@/lib/admin/lock"
import { audit, requestIp, type AuditEvent } from "@/lib/audit"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { env, isHttps, issuer, passkeyRpId, resolveSteamEndpoint, socialProviders, steamEnabled, turnstileEnabled } from "@/lib/env"
import { composeMail, sendMail, type MailKind } from "@/lib/mail"
import { buildClaims, normalizeLocale, TRETU_CLAIMS, TRETU_SCOPES } from "@/lib/oidc/claims"
import { hashPassword, isBreachedPassword, needsRehash, verifyStoredPassword } from "@/lib/passwords"
import { authorizeContinuation, REDIRECT_PARAMS, toSafePath } from "@/lib/redirects"
import { steam } from "@/lib/steam/plugin"
import { claimTotpCounter, matchingCounter } from "@/lib/totp-replay"
import { challengeUserId, consumeTrustedDevice, replaceSessionWithChallenge } from "@/lib/two-factor-challenge"
import { emitUserEvent } from "@/lib/tretu/events"
import { isValidUsername, normalizeUsername, pickUsername, USERNAME_MAX, USERNAME_MIN } from "@/lib/usernames"
import { getClaimSource, getUserLinks, isAdmin } from "@/lib/users"

/** Paths whose new passwords are checked against Have I Been Pwned. */
const BREACH_CHECKED_PATHS = new Set(["/sign-up/email", "/change-password", "/reset-password", "/set-password"])

async function usernameTaken(lowercase: string) {
  const row = await db.query.user.findFirst({ where: eq(schema.user.username, lowercase), columns: { id: true } })
  return Boolean(row)
}

/** The language for an email: the user's saved language, else the request's. */
async function mailLocale(userId: string | undefined, request?: Request): Promise<Locale> {
  if (userId) {
    const row = await db.query.user.findFirst({ where: eq(schema.user.id, userId), columns: { locale: true } })
    if (row) return normalizeLocale(row.locale)
  }
  return localeFromHeaders(request?.headers.get("cookie"), request?.headers.get("accept-language"))
}

/** Always to the account's current address: a change of address is confirmed by the old one (it names the new one). */
async function mail(kind: MailKind, user: { id?: string; email: string; name: string }, url: string | undefined, request?: Request, newEmail?: string) {
  await sendMail(composeMail(kind, await mailLocale(user.id, request), user.email, { name: user.name, url, newEmail }))
}

/** Finds the user a sign-in or reset request is about (by email or username in the body). */
async function userFromBody(body: unknown): Promise<string | null> {
  const record = (body ?? {}) as Record<string, unknown>
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : null
  const name = typeof record.username === "string" ? normalizeUsername(record.username) : null
  if (!email && !name) return null
  const row = await db.query.user.findFirst({
    where: email ? eq(schema.user.email, email) : eq(schema.user.username, name!),
    columns: { id: true },
  })
  return row?.id ?? null
}

/**
 * Sign-ins that Better Auth's two-factor plugin does not challenge itself: provider callbacks, Steam, magic links
 * and email confirmation links (which sign in). For two-factor accounts the tretu plugin asks for the code.
 * Passkeys are not on the list: a passkey with user verification already is two factors.
 */
const isSecondFactorBypass = (path: string) =>
  path.startsWith("/callback/") || path.startsWith("/oauth2/callback/") || path === "/magic-link/verify" || path === "/verify-email" || path === "/steam/callback"

/** The method of a sign-in, for the activity log. Hooks see route templates (`/callback/:id`): the provider is a param. */
const signInMethod = (path: string, params?: Record<string, unknown> | null) => {
  if (path.startsWith("/callback/") || path.startsWith("/oauth2/callback/")) {
    const id = typeof params?.id === "string" ? params.id : path.split("/").pop()
    return id && !id.startsWith(":") ? id : "oauth"
  }
  return SIGN_IN_METHODS[path] ?? "other"
}

const SIGN_IN_METHODS: Record<string, string> = {
  "/sign-in/email": "password",
  "/sign-in/username": "password",
  "/sign-up/email": "password",
  "/passkey/verify-authentication": "passkey",
  "/magic-link/verify": "magic-link",
  "/verify-email": "email-link",
  "/steam/callback": "steam",
  "/two-factor/verify-totp": "2fa",
  "/two-factor/verify-backup-code": "2fa-backup-code",
}

/** Success audit events per endpoint (failures of sign-in and 2FA endpoints are logged separately). */
const SUCCESS_EVENTS: Record<string, AuditEvent> = {
  "/change-password": "password.changed",
  "/set-password": "password.changed",
  "/request-password-reset": "password.reset_requested",
  "/two-factor/disable": "2fa.disabled",
  "/two-factor/generate-backup-codes": "2fa.backup_codes",
  "/passkey/verify-registration": "passkey.added",
  "/passkey/delete-passkey": "passkey.removed",
  "/revoke-sessions": "sessions.revoked",
  "/revoke-other-sessions": "sessions.revoked",
  "/revoke-session": "sessions.revoked",
  "/change-email": "email.change_requested",
  "/update-user": "profile.updated",
  "/sign-out": "logout",
}

/** Where the browser goes once the second factor is entered: the app sign-in, or the page the sign-in was for. */
async function afterSecondFactor(returned: unknown): Promise<string> {
  // Provider callbacks inside an app sign-in carry the app's request in the (server-side) OAuth state.
  const serverContext = (await getOAuthState())?.serverContext as { query?: unknown } | undefined
  if (typeof serverContext?.query === "string" && serverContext.query) return authorizeContinuation(serverContext.query)
  const location = isAPIError(returned) && returned.headers instanceof Headers ? returned.headers.get("location") : null
  const path = toSafePath(location, issuer)
  if (!path) return "/konto"
  // Email links inside an app sign-in return to /login?<signed request>; go straight to the app instead.
  const url = new URL(path, issuer)
  if (url.pathname === "/login" && url.searchParams.has("client_id")) return authorizeContinuation(url.search)
  return path
}

/** A sign-in method other than the one being removed must remain: another linked account or a passkey. */
async function keepsASignInMethod(userId: string, accountRowId: string): Promise<boolean> {
  const [others] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), ne(schema.account.id, accountRowId)))
  if ((others?.n ?? 0) > 0) return true
  const passkey = await db.query.passkey.findFirst({ where: eq(schema.passkey.userId, userId), columns: { id: true } })
  return Boolean(passkey)
}

/*
 * Locked accounts (lib/admin/lock.ts). Every sign-in creates a session, and the session create hook refuses it for a
 * locked account: password, passkey and two-factor sign-ins get a JSON error with code ACCOUNT_LOCKED (and
 * `lockedUntil`), which the forms show as a friendly message; sign-ins that arrive as a page load (Discord, Google,
 * Apple and Steam callbacks, magic links, email confirmation links) are redirected to the login page, which shows it.
 */
function accountLockedError(until: Date | null) {
  return new APIError("FORBIDDEN", { message: "This Tretu-Konto is locked.", code: ACCOUNT_LOCKED, lockedUntil: until?.toISOString() ?? null })
}

function accountLockedUrl(until: Date | null) {
  const url = new URL("/login", issuer)
  url.searchParams.set("error", ACCOUNT_LOCKED)
  if (until) url.searchParams.set("until", until.toISOString())
  return url.toString()
}

/** Whether an endpoint's result is the refusal of a locked account (JSON error or redirect to the login page). */
function isLockRefusal(returned: unknown): boolean {
  if (!isAPIError(returned)) return false
  if ((returned.body as { code?: unknown } | undefined)?.code === ACCOUNT_LOCKED) return true
  const location = returned.headers instanceof Headers ? returned.headers.get("location") : null
  return Boolean(location && new URL(location, issuer).searchParams.get("error") === ACCOUNT_LOCKED)
}

/** Endpoints that hand out OIDC authorization codes for the browser's existing session. */
const OIDC_SESSION_PATHS = new Set(["/oauth2/authorize", "/oauth2/continue", "/oauth2/consent"])

/**
 * Tretu's own rules on top of Better Auth: username rules, redirect targets, unlink rules, the second factor for
 * provider and email-link sign-ins, audit log, transparent re-hashing of imported passwords and the user events
 * for the platform.
 */
const tretu = (): BetterAuthPlugin => ({
  id: "tretu",
  hooks: {
    before: [
      {
        // Open-redirect protection: every redirect parameter must stay on this site (lib/redirects.ts).
        matcher: () => true,
        handler: createAuthMiddleware(async (ctx) => {
          for (const source of [ctx.body, ctx.query] as unknown[]) {
            if (!source || typeof source !== "object") continue
            for (const key of REDIRECT_PARAMS) {
              const value = (source as Record<string, unknown>)[key]
              if (value !== undefined && value !== "" && !toSafePath(value, issuer)) {
                throw new APIError("FORBIDDEN", { message: "Invalid redirect target.", code: "INVALID_REDIRECT" })
              }
            }
          }
        }),
      },
      {
        matcher: (ctx) => ctx.path === "/sign-up/email" || ctx.path === "/update-user",
        handler: createAuthMiddleware(async (ctx) => {
          const body = (ctx.body ?? {}) as Record<string, unknown>
          if (ctx.path === "/update-user") {
            // Renames go through the account page (shared names, rename limits); never through update-user.
            if ("username" in body || "displayUsername" in body) {
              throw new APIError("BAD_REQUEST", { message: "Use the account page to change the username.", code: "USERNAME_CHANGE_NOT_ALLOWED" })
            }
            return
          }
          const name = typeof body.username === "string" ? body.username.trim() : ""
          if (!isValidUsername(name)) throw new APIError("BAD_REQUEST", { message: "Invalid username.", code: "INVALID_USERNAME" })
          if (await usernameTaken(normalizeUsername(name))) {
            throw new APIError("BAD_REQUEST", { message: "Username is already taken.", code: "USERNAME_IS_ALREADY_TAKEN" })
          }
        }),
      },
      {
        // TOTP replay protection (lib/totp-replay.ts): every verification of a TOTP goes through this endpoint.
        matcher: (ctx) => ctx.path === "/two-factor/verify-totp",
        handler: createAuthMiddleware(async (ctx) => {
          const code = String((ctx.body as { code?: unknown } | undefined)?.code ?? "").replace(/\s/g, "")
          const session = await getSessionFromCtx(ctx)
          const userId = session?.user.id ?? (await challengeUserId(ctx))
          if (!userId) return // Better Auth answers INVALID_TWO_FACTOR_COOKIE
          const row = await db.query.twoFactor.findFirst({ where: eq(schema.twoFactor.userId, userId), columns: { secret: true } })
          if (!row) return
          let secret: string | Uint8Array
          try {
            secret = await symmetricDecrypt({ key: ctx.context.secretConfig, data: row.secret })
            if (secret.startsWith("base32:")) secret = base32.decode(secret.slice(7).toUpperCase())
          } catch {
            return
          }
          const counter = await matchingCounter(secret, code)
          if (counter === null) return // a wrong code: Better Auth counts and refuses it
          if (!(await claimTotpCounter(db, userId, counter))) {
            const headers = ctx.request?.headers ?? ctx.headers
            await audit("2fa.failed", { userId, success: false, ipAddress: requestIp(headers), userAgent: headers?.get("user-agent"), meta: { method: "totp", code: "TOTP_CODE_REUSED" } })
            throw new APIError("UNAUTHORIZED", { message: "This code was already used. Please wait for the next one.", code: "TOTP_CODE_REUSED" })
          }
        }),
      },
      {
        // A locked account never gets an authorization code, also not from a session that predates the lock.
        matcher: (ctx) => OIDC_SESSION_PATHS.has(ctx.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx)
          if (!session) return
          const lock = await activeLock(session.user.id)
          if (!lock) return
          await db.transaction((tx) => revokeAllAccess(tx, session.user.id))
          deleteSessionCookie(ctx, true)
          const headers = ctx.request?.headers ?? ctx.headers
          await audit("login.failed", { userId: session.user.id, success: false, ipAddress: requestIp(headers), userAgent: headers?.get("user-agent"), meta: { method: "session", code: ACCOUNT_LOCKED } })
          if (ctx.path === "/oauth2/authorize") throw ctx.redirect(accountLockedUrl(lock.until))
          throw accountLockedError(lock.until)
        }),
      },
      {
        // Disconnecting Discord, Google, Apple or Steam: only while another way to sign in remains.
        matcher: (ctx) => ctx.path === "/unlink-account",
        handler: createAuthMiddleware(async (ctx) => {
          const accountId = (ctx.body as { accountId?: unknown } | undefined)?.accountId
          const session = ctx.context.session ?? (await getSessionFromCtx(ctx))
          if (!session || typeof accountId !== "string") return
          const row = await db.query.account.findFirst({ where: and(eq(schema.account.id, accountId), eq(schema.account.userId, session.user.id)), columns: { id: true, providerId: true } })
          if (!row) return
          if (row.providerId === "credential") throw new APIError("BAD_REQUEST", { message: "The password is removed elsewhere.", code: "CANNOT_UNLINK_PASSWORD" })
          if (!(await keepsASignInMethod(session.user.id, row.id))) {
            throw new APIError("BAD_REQUEST", { message: "This is the only way to sign in.", code: "FAILED_TO_UNLINK_LAST_ACCOUNT" })
          }
        }),
      },
    ],
    after: [
      {
        matcher: () => true,
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned
          // Redirects (provider callbacks, email links) are APIErrors too, but successful ones.
          const failed = isAPIError(returned) && returned.statusCode >= 400
          const headers = ctx.request?.headers ?? ctx.headers
          const base = { ipAddress: requestIp(headers), userAgent: headers?.get("user-agent") ?? null }
          const path = ctx.path
          const sessionUserId = ctx.context.session?.user.id ?? null

          // A sign-in refused because the account is locked: already in the activity log (see the session hook).
          if (isLockRefusal(returned)) return

          if (path === "/passkey/verify-authentication" && !failed) {
            const credentialId = (ctx.body as { response?: { id?: unknown } } | undefined)?.response?.id
            if (typeof credentialId === "string") await db.update(schema.passkey).set({ lastUsedAt: new Date() }).where(eq(schema.passkey.credentialID, credentialId))
          }

          if (path === "/sign-in/email" || path === "/sign-in/username") {
            const userId = await userFromBody(ctx.body)
            if (failed) {
              const code = (returned as APIError).body?.code
              await audit("login.failed", { ...base, userId, success: false, meta: { method: "password", code } })
              return
            }
            // Imported Saga/Nakama hashes become native on the first successful sign-in.
            const password = (ctx.body as { password?: unknown } | undefined)?.password
            if (userId && typeof password === "string") {
              const credential = await db.query.account.findFirst({
                where: and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")),
                columns: { id: true, password: true },
              })
              if (credential && needsRehash(credential.password) && (await verifyStoredPassword(credential.password, password))) {
                await db.update(schema.account).set({ password: await hashPassword(password) }).where(eq(schema.account.id, credential.id))
                await audit("password.rehashed", { ...base, userId })
              }
            }
            return
          }
          if (failed && (path === "/two-factor/verify-totp" || path === "/two-factor/verify-backup-code")) {
            await audit("2fa.failed", { ...base, userId: sessionUserId ?? (await challengeUserId(ctx)), success: false, meta: { method: path.endsWith("backup-code") ? "backup-code" : "totp" } })
            return
          }
          if (failed) return

          // Two-factor accounts (all admins): a provider or email-link sign-in only proves the first factor. Its
          // session is replaced by the two-factor challenge before anything (an app's OIDC code, /konto) can use it.
          // A session the browser already had (e.g. confirming a new email address while signed in) passed its
          // second factor long ago and is only refreshed.
          const newSession = ctx.context.newSession
          const incomingToken = newSession ? await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret) : null
          if (newSession?.user.twoFactorEnabled && isSecondFactorBypass(path) && incomingToken !== newSession.session.token) {
            const method = signInMethod(path, ctx.params)
            if (await consumeTrustedDevice(ctx, newSession.user.id)) {
              await db.update(schema.user).set({ lastLoginAt: new Date() }).where(eq(schema.user.id, newSession.user.id))
              await audit("login", { ...base, userId: newSession.user.id, meta: { method, trustedDevice: true } })
              return
            }
            const next = await afterSecondFactor(returned)
            await replaceSessionWithChallenge(ctx, { token: newSession.session.token, userId: newSession.user.id })
            await audit("2fa.challenge", { ...base, userId: newSession.user.id, meta: { method } })
            throw ctx.redirect(`${issuer}/2fa?next=${encodeURIComponent(next)}`)
          }
          if (path === "/two-factor/verify-totp" && ctx.context.session && !ctx.context.session.user.twoFactorEnabled) {
            await audit("2fa.enabled", { ...base, userId: sessionUserId })
            return
          }
          if (path === "/two-factor/verify-backup-code") {
            const userId = newSession?.user.id ?? sessionUserId
            if (userId) await audit("2fa.backup_code_used", { ...base, userId })
            return
          }
          const event = SUCCESS_EVENTS[path]
          if (!event) return
          const userId = event === "password.reset_requested" ? await userFromBody(ctx.body) : sessionUserId
          if (!userId) return
          await audit(event, { ...base, userId })
          if (path === "/update-user") await emitUserEvent("user.updated", userId)
        }),
      },
    ],
  },
})

/** Apple's ID token is verified against Apple's published keys (issuer, audience, expiry), not only decoded. */
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), { timeoutDuration: 5000, cooldownDuration: 30_000 })

async function appleUserInfo(token: { idToken?: string; user?: { name?: { firstName?: string; lastName?: string } } }) {
  if (!token.idToken) return null
  const audience = [env.APPLE_CLIENT_ID!, ...(env.APPLE_APP_BUNDLE_IDENTIFIER ? [env.APPLE_APP_BUNDLE_IDENTIFIER] : [])]
  let payload: Record<string, unknown>
  try {
    ;({ payload } = await jwtVerify(token.idToken, appleKeys, { issuer: "https://appleid.apple.com", audience, algorithms: ["RS256"], maxTokenAge: "1h" }))
  } catch (error) {
    console.warn("[apple] ID token rejected:", error instanceof Error ? error.name : "error")
    return null
  }
  if (typeof payload.sub !== "string" || !payload.sub) return null
  const typedName = token.user?.name ? `${token.user.name.firstName ?? ""} ${token.user.name.lastName ?? ""}`.trim() : ""
  const name = typedName || (typeof payload.name === "string" ? payload.name : "")
  const email = typeof payload.email === "string" ? payload.email : undefined
  const emailVerified = payload.email_verified === true || payload.email_verified === "true"
  return {
    user: { name, email, emailVerified, ...(name && { displayUsername: name }) },
    data: { ...payload, name } as unknown as AppleProfile,
  }
}

const enabledSocialProviders = {
  ...(socialProviders.discord && {
    discord: {
      clientId: env.DISCORD_CLIENT_ID!,
      clientSecret: env.DISCORD_CLIENT_SECRET!,
      // The Discord handle seeds the Tretu username, made valid and unique in the user create hook. It goes in
      // `displayUsername`: a `username` here would be rejected by the username plugin if taken or invalid.
      mapProfileToUser: (profile: { username?: string; global_name?: string | null }) => ({
        displayUsername: profile.username,
        name: profile.global_name || profile.username,
      }),
    },
  }),
  ...(socialProviders.google && {
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account" as const,
      mapProfileToUser: (profile: { given_name?: string; name?: string; email?: string }) => ({
        displayUsername: profile.given_name || profile.name || profile.email,
      }),
    },
  }),
  ...(socialProviders.apple && {
    apple: {
      clientId: env.APPLE_CLIENT_ID!,
      clientSecret: env.APPLE_CLIENT_SECRET!,
      ...(env.APPLE_APP_BUNDLE_IDENTIFIER && { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }),
      getUserInfo: appleUserInfo as NonNullable<AppleOptions["getUserInfo"]>,
    },
  }),
}

export const auth = betterAuth({
  appName: "Tretu-Konto",
  baseURL: issuer,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [issuer, ...(socialProviders.apple ? ["https://appleid.apple.com"] : [])],
  // Problems in OAuth callbacks land on our error page with their code, never on a bare JSON response.
  onAPIError: { errorURL: `${issuer}/fehler` },
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // The jwt plugin's session-to-JWT endpoint is not needed: apps get ID tokens through OIDC.
  disabledPaths: ["/token"],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: false,
    // A reset is often a reaction to someone else being in the account: every other device is signed out.
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }, request) => mail("resetPassword", user, url, request),
    onPasswordReset: async ({ user }, request) => {
      await audit("password.reset", { userId: user.id, ipAddress: requestIp(request?.headers), userAgent: request?.headers.get("user-agent") })
    },
    password: {
      hash: async (password) => {
        const path = getCurrentAuthEndpointContext()?.path
        if (path && BREACH_CHECKED_PATHS.has(path) && env.NODE_ENV !== "test" && process.env.AUTH_HIBP !== "off" && (await isBreachedPassword(password))) {
          throw new APIError("BAD_REQUEST", {
            message: "This password appeared in a data breach. Please choose another one.",
            code: "PASSWORD_COMPROMISED",
          })
        }
        return hashPassword(password)
      },
      verify: async ({ hash, password }) => verifyStoredPassword(hash, password),
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }, request) => mail("verifyEmail", user, url, request),
    afterEmailVerification: async (user, request) => {
      await audit("email.verified", { userId: user.id, ipAddress: requestIp(request?.headers), userAgent: request?.headers.get("user-agent") })
    },
  },
  socialProviders: enabledSocialProviders,
  account: {
    // Discord, Google and Apple can be connected in "Verknüpfte Konten", even with another email address there.
    // Unlinking the last provider is allowed by Better Auth here because the tretu plugin enforces the real rule:
    // another account or a passkey must remain (see keepsASignInMethod).
    accountLinking: { enabled: true, trustedProviders: ["google", "apple"], allowDifferentEmails: true, allowUnlinkingAll: true },
    encryptOAuthTokens: true,
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }, request) => mail("changeEmail", user, url, request, newEmail),
    },
    additionalFields: {
      locale: { type: "string", required: false, defaultValue: "de", input: false },
      roles: { type: "string[]", required: false, defaultValue: [], input: false },
      usernamePending: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 15,
  },
  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT === "on",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-in/username": { window: 60, max: 8 },
      "/sign-up/email": { window: 300, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/sign-in/magic-link": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
      "/change-email": { window: 300, max: 3 },
      "/change-password": { window: 300, max: 5 },
      "/two-factor/verify-totp": { window: 60, max: 6 },
      "/two-factor/verify-backup-code": { window: 60, max: 6 },
      "/passkey/verify-authentication": { window: 60, max: 10 },
      "/is-username-available": { window: 60, max: 20 },
      "/sign-in/social": { window: 60, max: 10 },
      "/link-social": { window: 60, max: 10 },
      "/unlink-account": { window: 60, max: 10 },
      "/magic-link/verify": { window: 60, max: 10 },
      "/sign-in/steam": { window: 60, max: 10 },
      "/steam/link": { window: 60, max: 10 },
      "/steam/callback": { window: 60, max: 20 },
    },
  },
  advanced: {
    // Host-only `__Host-` cookies over HTTPS: Secure, Path=/, no Domain, SameSite=Lax.
    useSecureCookies: false,
    cookiePrefix: isHttps ? "__Host-tretu" : "tretu",
    defaultCookieAttributes: { secure: isHttps, sameSite: "lax", httpOnly: true, path: "/" },
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
    database: { generateId: () => crypto.randomUUID() },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data, context) => {
          // Plugin hooks run first: the username plugin has already lowercased `username` and kept the typed
          // form in `displayUsername`. Provider sign-ups only bring a seed in `displayUsername` (see socialProviders).
          const typed = (typeof data.displayUsername === "string" && data.displayUsername.trim()) || (typeof data.username === "string" && data.username.trim()) || ""
          const seed = typed || data.name || data.email
          const wanted = typed
          const chosen = isValidUsername(wanted) && !(await usernameTaken(normalizeUsername(wanted))) ? wanted : await pickUsername(seed, usernameTaken)
          const headers = context?.request?.headers ?? context?.headers
          return {
            data: {
              ...data,
              email: data.email.toLowerCase(),
              name: (data.name || chosen).slice(0, 64),
              username: normalizeUsername(chosen),
              displayUsername: chosen,
              locale: localeFromHeaders(headers?.get("cookie"), headers?.get("accept-language")),
            },
          }
        },
        after: async (user, context) => {
          const headers = context?.request?.headers ?? context?.headers
          await audit("register", { userId: user.id, ipAddress: requestIp(headers), userAgent: headers?.get("user-agent") })
          await emitUserEvent("user.created", user.id)
        },
      },
    },
    session: {
      create: {
        // Locked accounts get no session, whatever the sign-in method (see accountLockedError).
        before: async (session, context) => {
          const lock = await activeLock(session.userId)
          if (!lock) return
          const path = context?.path ?? ""
          const headers = context?.request?.headers ?? context?.headers
          await audit("login.failed", {
            userId: session.userId,
            success: false,
            ipAddress: requestIp(headers),
            userAgent: headers?.get("user-agent"),
            meta: { method: signInMethod(path, context?.params), code: ACCOUNT_LOCKED },
          })
          // Page loads (provider callbacks, email links) go to the login page; the provider callbacks pass a redirect on.
          if (context && (context.request?.method ?? context.method) === "GET") throw context.redirect(accountLockedUrl(lock.until))
          throw accountLockedError(lock.until)
        },
        after: async (session, context) => {
          const path = context?.path ?? ""
          if (isSecondFactorBypass(path)) {
            const owner = await db.query.user.findFirst({ where: eq(schema.user.id, session.userId), columns: { twoFactorEnabled: true } })
            if (owner?.twoFactorEnabled) return // only the first factor: the tretu plugin's after hook takes over
          }
          await db.update(schema.user).set({ lastLoginAt: new Date() }).where(eq(schema.user.id, session.userId))
          await audit("login", { userId: session.userId, ipAddress: session.ipAddress, userAgent: session.userAgent, meta: { method: signInMethod(path, context?.params) } })
        },
      },
    },
    account: {
      create: {
        after: async (account, context) => {
          if (account.providerId === "credential") return
          // A provider connected to an existing account: explicitly ("Verbinden" in Mein Konto, the OAuth state
          // carries `link`) or by a verified email on sign-in (not the account's own sign-up). Steam audits itself.
          if (context?.path?.startsWith("/callback/")) {
            const explicit = Boolean((await getOAuthState())?.link)
            const owner = explicit ? null : await db.query.user.findFirst({ where: eq(schema.user.id, account.userId), columns: { createdAt: true } })
            if (explicit || (owner && Date.now() - owner.createdAt.getTime() > 30_000)) {
              const headers = context.request?.headers ?? context.headers
              await audit("link.added", { userId: account.userId, ipAddress: requestIp(headers), userAgent: headers?.get("user-agent"), meta: { provider: account.providerId } })
            }
          }
          if (account.providerId === "discord" || account.providerId === "steam") await emitUserEvent("user.updated", account.userId)
        },
      },
      delete: {
        after: async (account, context) => {
          if (account.providerId !== "credential") {
            const headers = context?.request?.headers ?? context?.headers
            await audit("link.removed", { userId: account.userId, ipAddress: requestIp(headers), userAgent: headers?.get("user-agent"), meta: { provider: account.providerId } })
          }
          if (account.providerId === "discord" || account.providerId === "steam") await emitUserEvent("user.updated", account.userId)
        },
      },
    },
  },
  plugins: [
    tretu(),
    username({
      minUsernameLength: USERNAME_MIN,
      maxUsernameLength: USERNAME_MAX,
      usernameValidator: (name) => isValidUsername(name),
      displayUsernameValidator: (name) => isValidUsername(name),
    }),
    // ID tokens are RS256 (the OIDC default every client library supports); `iss` is the bare issuer.
    jwt({
      jwt: { issuer },
      jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
      disableSettingJwtHeader: true,
    }),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/zustimmung",
      scopes: [...TRETU_SCOPES],
      grantTypes: ["authorization_code", "refresh_token"],
      allowDynamicClientRegistration: false,
      accessTokenExpiresIn: 60 * 60,
      idTokenExpiresIn: 60 * 60,
      refreshTokenExpiresIn: 60 * 60 * 24 * 60,
      advertisedMetadata: { claims_supported: [...TRETU_CLAIMS] },
      // Admins must have 2FA before signing in to any app; legacy users with a taken name pick a new one first.
      postLogin: {
        page: "/weiter",
        consentReferenceId: () => undefined,
        shouldRedirect: async ({ user }) => {
          const row = await db.query.user.findFirst({
            where: eq(schema.user.id, user.id),
            columns: { roles: true, twoFactorEnabled: true, usernamePending: true },
          })
          return Boolean(row && ((isAdmin(row.roles) && !row.twoFactorEnabled) || row.usernamePending))
        },
      },
      customIdTokenClaims: async ({ user, scopes }) => claimsFor(user.id, scopes),
      customUserInfoClaims: async ({ user, scopes }) => claimsFor(user.id, scopes),
    }),
    passkey({ rpID: passkeyRpId(), rpName: "Tretu", origin: issuer }),
    twoFactor({
      issuer: "Tretu",
      backupCodeOptions: { amount: 10, length: 10 },
      // Discord-only accounts (many admins) have no password and must still be able to turn 2FA on.
      allowPasswordless: true,
      accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
    }),
    magicLink({
      expiresIn: 60 * 10,
      disableSignUp: true,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }, ctx) => {
        const row = await db.query.user.findFirst({ where: eq(schema.user.email, email.toLowerCase()), columns: { id: true, name: true } })
        if (row) await mail("magicLink", { id: row.id, email, name: row.name }, url, ctx?.request)
      },
    }),
    steam({ enabled: steamEnabled, issuer, endpoint: resolveSteamEndpoint(env.STEAM_OPENID_ENDPOINT), webApiKey: env.STEAM_WEB_API_KEY }),
    ...(turnstileEnabled ? [captcha({ provider: "cloudflare-turnstile", secretKey: env.TURNSTILE_SECRET_KEY!, endpoints: ["/sign-up/email"] })] : []),
    nextCookies(),
  ],
})

async function claimsFor(userId: string, scopes: readonly string[]) {
  const source = await getClaimSource(userId)
  if (!source) return {}
  const links = scopes.includes("tretu") ? await getUserLinks(userId) : {}
  return buildClaims(source, links, scopes)
}

export type Session = typeof auth.$Infer.Session

/** Users signing in with email or username: `or` is used by the login form's single identifier field. */
export async function findUserByIdentifier(identifier: string) {
  const value = identifier.trim().toLowerCase()
  return db.query.user.findFirst({ where: or(eq(schema.user.email, value), eq(schema.user.username, value)), columns: { id: true, email: true } })
}
