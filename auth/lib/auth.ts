import { oauthProvider } from "@better-auth/oauth-provider"
import { passkey } from "@better-auth/passkey"
import { getCurrentAuthEndpointContext } from "@better-auth/core/context"
import { betterAuth, type BetterAuthPlugin } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api"
import { deleteSessionCookie } from "better-auth/cookies"
import { nextCookies } from "better-auth/next-js"
import { captcha, jwt, magicLink, twoFactor, username } from "better-auth/plugins"
import { and, eq, or } from "drizzle-orm"
import { localeFromHeaders, type Locale } from "@/i18n/locales"
import { audit, requestIp, type AuditEvent } from "@/lib/audit"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { env, isHttps, issuer, passkeyRpId, socialProviders, turnstileEnabled } from "@/lib/env"
import { composeMail, sendMail, type MailKind } from "@/lib/mail"
import { buildClaims, normalizeLocale, TRETU_CLAIMS, TRETU_SCOPES } from "@/lib/oidc/claims"
import { hashPassword, isBreachedPassword, needsRehash, verifyStoredPassword } from "@/lib/passwords"
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

async function mail(kind: MailKind, user: { id?: string; email: string; name: string }, url: string | undefined, request?: Request, newEmail?: string) {
  await sendMail(composeMail(kind, await mailLocale(user.id, request), newEmail ?? user.email, { name: user.name, url, newEmail }))
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

/** Sign-ins that Better Auth's two-factor plugin does not challenge. */
const isSecondFactorBypass = (path: string) => path.startsWith("/callback/") || path.startsWith("/oauth2/callback/") || path === "/magic-link/verify"

const signInMethod = (path: string) =>
  path.startsWith("/callback/") || path.startsWith("/oauth2/callback/") ? (path.split("/").pop() ?? "oauth") : (SIGN_IN_METHODS[path] ?? "other")

const SIGN_IN_METHODS: Record<string, string> = {
  "/sign-in/email": "password",
  "/sign-in/username": "password",
  "/sign-up/email": "password",
  "/passkey/verify-authentication": "passkey",
  "/magic-link/verify": "magic-link",
  "/verify-email": "email-link",
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

/**
 * Tretu's own rules on top of Better Auth: username rules, audit log, transparent re-hashing of imported
 * passwords and the user events for the platform.
 */
const tretu = (): BetterAuthPlugin => ({
  id: "tretu",
  hooks: {
    before: [
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
    ],
    after: [
      {
        matcher: () => true,
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned
          const failed = isAPIError(returned)
          const headers = ctx.request?.headers ?? ctx.headers
          const base = { ipAddress: requestIp(headers), userAgent: headers?.get("user-agent") ?? null }
          const path = ctx.path
          const sessionUserId = ctx.context.session?.user.id ?? null

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
            await audit("2fa.failed", { ...base, userId: sessionUserId, success: false })
            return
          }
          if (failed) return
          // Two-factor accounts (all admins) only sign in with password + code or a passkey: Better Auth's
          // two-factor check does not cover provider sign-ins and email links, so those are turned away here.
          const newSession = ctx.context.newSession
          if (newSession?.user.twoFactorEnabled && isSecondFactorBypass(path)) {
            await ctx.context.internalAdapter.deleteSession(newSession.session.token)
            deleteSessionCookie(ctx)
            ctx.context.setNewSession(null)
            await audit("login.failed", { ...base, userId: newSession.user.id, success: false, meta: { method: signInMethod(path), code: "TWO_FACTOR_REQUIRED" } })
            throw ctx.redirect(`${issuer}/login?error=two_factor_required`)
          }
          if (path === "/two-factor/verify-totp" && ctx.context.session && !ctx.context.session.user.twoFactorEnabled) {
            await audit("2fa.enabled", { ...base, userId: sessionUserId })
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

const enabledSocialProviders = {
  ...(socialProviders.discord && {
    discord: {
      clientId: env.DISCORD_CLIENT_ID!,
      clientSecret: env.DISCORD_CLIENT_SECRET!,
      // The Discord handle seeds the Tretu username (made unique in the user create hook).
      mapProfileToUser: (profile: { username?: string; global_name?: string | null }) => ({
        username: profile.username,
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
        username: profile.given_name || profile.name || profile.email,
      }),
    },
  }),
  ...(socialProviders.apple && {
    apple: {
      clientId: env.APPLE_CLIENT_ID!,
      clientSecret: env.APPLE_CLIENT_SECRET!,
      ...(env.APPLE_APP_BUNDLE_IDENTIFIER && { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }),
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
    accountLinking: { enabled: true, trustedProviders: ["google", "apple"], allowDifferentEmails: true },
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
          const seed = (typeof data.username === "string" && data.username) || data.name || data.email
          const wanted = typeof data.username === "string" ? data.username.trim() : ""
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
        after: async (session, context) => {
          const path = context?.path ?? ""
          if (isSecondFactorBypass(path)) {
            const owner = await db.query.user.findFirst({ where: eq(schema.user.id, session.userId), columns: { twoFactorEnabled: true } })
            if (owner?.twoFactorEnabled) return // turned away in the tretu plugin's after hook
          }
          await db.update(schema.user).set({ lastLoginAt: new Date() }).where(eq(schema.user.id, session.userId))
          await audit("login", { userId: session.userId, ipAddress: session.ipAddress, userAgent: session.userAgent, meta: { method: signInMethod(path) } })
        },
      },
    },
    account: {
      create: {
        after: async (account, context) => {
          if (account.providerId === "credential") return
          // A provider connected to an existing account (not the account's first sign-up).
          if (context?.path?.startsWith("/callback/") || context?.path === "/link-social") {
            const owner = await db.query.user.findFirst({ where: eq(schema.user.id, account.userId), columns: { createdAt: true } })
            if (owner && Date.now() - owner.createdAt.getTime() > 30_000) {
              await audit("link.added", { userId: account.userId, meta: { provider: account.providerId } })
            }
          }
          if (account.providerId === "discord") await emitUserEvent("user.updated", account.userId)
        },
      },
      delete: {
        after: async (account, context) => {
          if (account.providerId !== "credential") {
            const headers = context?.request?.headers ?? context?.headers
            await audit("link.removed", { userId: account.userId, ipAddress: requestIp(headers), userAgent: headers?.get("user-agent"), meta: { provider: account.providerId } })
          }
          if (account.providerId === "discord") await emitUserEvent("user.updated", account.userId)
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
