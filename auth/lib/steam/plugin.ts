import { randomUUID } from "node:crypto"
import type { BetterAuthPlugin, GenericEndpointContext } from "@better-auth/core"
import { runWithTransaction } from "@better-auth/core/context"
import { getOAuthProviderState } from "@better-auth/oauth-provider"
import { APIError, createAuthEndpoint, getSessionFromCtx, sessionMiddleware } from "better-auth/api"
import { expireCookie, setSessionCookie } from "better-auth/cookies"
import { generateRandomString } from "better-auth/crypto"
import { and, eq, lt } from "drizzle-orm"
import { z } from "zod"
import { audit, requestIp } from "@/lib/audit"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { isPlaceholderEmail, placeholderEmail } from "@/lib/oidc/claims"
import { authorizeContinuation, toSafePath } from "@/lib/redirects"
import { buildCheckidSetupUrl, verifySteamAssertion, type SteamAssertionError } from "./openid"
import { fetchSteamProfile, type SteamProfile } from "./profile"

/**
 * "Mit Steam anmelden" as a Better Auth plugin (provider id `steam`). Steam speaks OpenID 2.0, not OAuth 2, so it
 * cannot be a Better Auth social provider; these endpoints do the same job:
 *
 * - `POST /sign-in/steam` — sign in or sign up; inside an app sign-in the signed request travels along
 *   (`oauth_query`, verified by the oauth-provider plugin) and the app flow continues afterwards;
 * - `POST /steam/link` — connect Steam to the signed-in account (Mein Konto → Verknüpfte Konten);
 * - `GET /steam/callback` — the `return_to` address: verifies the assertion (lib/steam/openid.ts) and creates or
 *   links the `account` row (providerId `steam`, accountId = SteamID64), then the session, like other providers.
 *
 * The flow is bound to the browser by a signed, HttpOnly `steam_state` cookie that must match the one-time state
 * in `return_to`. Unlinking uses Better Auth's `/unlink-account` (rules in lib/auth.ts). The second factor for
 * two-factor accounts is asked by the tretu plugin's after hook, like for every other provider.
 */

const STATE_COOKIE = "steam_state"
const STATE_SECONDS = 10 * 60
export const STEAM_PROVIDER_ID = "steam"

interface SteamState {
  callbackURL: string
  errorURL: string
  newUserURL: string | null
  /** Set for "connect Steam" from Mein Konto: the user who started it. */
  linkUserId: string | null
  disableSignUp: boolean
  /** The app's authorization request when the sign-in happens inside one (unsigned, already verified). */
  oauthQuery: string | null
}

export interface SteamPluginOptions {
  enabled: boolean
  issuer: string
  endpoint: string
  webApiKey?: string
}

const startBody = z.object({
  callbackURL: z.string().max(2048).optional(),
  errorCallbackURL: z.string().max(2048).optional(),
  newUserCallbackURL: z.string().max(2048).optional(),
  disableSignUp: z.boolean().optional(),
  oauth_query: z.string().max(8192).optional(),
})

const linkBody = z.object({
  callbackURL: z.string().max(2048).optional(),
  errorCallbackURL: z.string().max(2048).optional(),
})

function withError(path: string, issuer: string, error: string): string {
  const url = new URL(path, issuer)
  url.searchParams.set("error", error)
  return url.toString()
}

/** Steam's answers that are only interesting for the log; the user sees one friendly message. */
const USER_ERROR: Record<SteamAssertionError, string> = {
  cancelled: "access_denied",
  invalid_response: "steam_failed",
  wrong_endpoint: "steam_failed",
  wrong_return_to: "steam_failed",
  invalid_identity: "steam_failed",
  nonce_expired: "steam_failed",
  not_verified: "steam_failed",
  nonce_replayed: "steam_failed",
}

async function consumeNonce(nonce: string, expiresAt: Date): Promise<boolean> {
  await db.delete(schema.openidNonce).where(lt(schema.openidNonce.expiresAt, new Date()))
  const rows = await db.insert(schema.openidNonce).values({ nonce, expiresAt }).onConflictDoNothing().returning({ nonce: schema.openidNonce.nonce })
  return rows.length === 1
}

async function saveDisplayName(accountRowId: string, profile: SteamProfile | null) {
  if (profile?.personaName) await db.update(schema.account).set({ displayName: profile.personaName }).where(eq(schema.account.id, accountRowId))
}

export function steam(options: SteamPluginOptions): BetterAuthPlugin {
  const { issuer, endpoint } = options
  const returnToBase = `${issuer}/api/auth/steam/callback`
  const realm = `${issuer}/`

  function ensureEnabled() {
    if (!options.enabled) throw new APIError("NOT_FOUND", { message: "Steam sign-in is not enabled", code: "STEAM_DISABLED" })
  }

  function safe(value: string | undefined, fallback: string): string {
    if (value === undefined) return fallback
    const path = toSafePath(value, issuer)
    if (!path) throw new APIError("BAD_REQUEST", { message: "Invalid redirect target", code: "INVALID_REDIRECT" })
    return path
  }

  async function start(ctx: GenericEndpointContext, state: SteamState) {
    const id = generateRandomString(32)
    await ctx.context.internalAdapter.createVerificationValue({
      identifier: `steam-state:${id}`,
      value: JSON.stringify(state),
      expiresAt: new Date(Date.now() + STATE_SECONDS * 1000),
    })
    const cookie = ctx.context.createAuthCookie(STATE_COOKIE, { maxAge: STATE_SECONDS })
    await ctx.setSignedCookie(cookie.name, id, ctx.context.secret, cookie.attributes)
    const returnTo = `${returnToBase}?state=${id}`
    return ctx.json({ url: buildCheckidSetupUrl(endpoint, returnTo, realm), redirect: true })
  }

  return {
    id: "steam",
    endpoints: {
      signInSteam: createAuthEndpoint("/sign-in/steam", { method: "POST", body: startBody }, async (ctx) => {
        ensureEnabled()
        const oauth = ctx.body.oauth_query ? await getOAuthProviderState() : null
        return start(ctx, {
          callbackURL: safe(ctx.body.callbackURL, "/konto"),
          errorURL: safe(ctx.body.errorCallbackURL, "/login"),
          newUserURL: ctx.body.newUserCallbackURL ? safe(ctx.body.newUserCallbackURL, "/konto") : null,
          linkUserId: null,
          disableSignUp: ctx.body.disableSignUp === true,
          oauthQuery: oauth?.query ?? null,
        })
      }),

      linkSteam: createAuthEndpoint("/steam/link", { method: "POST", body: linkBody, use: [sessionMiddleware] }, async (ctx) => {
        ensureEnabled()
        return start(ctx, {
          callbackURL: safe(ctx.body.callbackURL, "/konto?tab=konten"),
          errorURL: safe(ctx.body.errorCallbackURL, "/fehler"),
          newUserURL: null,
          linkUserId: ctx.context.session.user.id,
          disableSignUp: true,
          oauthQuery: null,
        })
      }),

      steamCallback: createAuthEndpoint("/steam/callback", { method: "GET" }, async (ctx) => {
        ensureEnabled()
        const query = new URLSearchParams(ctx.request ? new URL(ctx.request.url).search : "")
        const fail = (path: string, error: string, reason: string): never => {
          console.warn(`[steam] sign-in refused: ${reason}`)
          throw ctx.redirect(withError(path, issuer, error))
        }

        // 1. The flow must have been started in this browser (signed cookie = one-time state in return_to).
        const cookie = ctx.context.createAuthCookie(STATE_COOKIE, { maxAge: STATE_SECONDS })
        const stateId = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
        expireCookie(ctx, cookie)
        const queryState = query.get("state")
        if (!stateId || !queryState || query.getAll("state").length !== 1 || stateId !== queryState) return fail("/login", "state_mismatch", "state cookie missing or different")
        const record = await ctx.context.internalAdapter.consumeVerificationValue(`steam-state:${stateId}`)
        if (!record || record.expiresAt < new Date()) return fail("/login", "state_mismatch", "state unknown or expired")
        const state = JSON.parse(record.value) as SteamState

        // 2. The assertion itself (fields, check_authentication with Steam, nonce replay).
        const verified = await verifySteamAssertion(query, { endpoint, returnTo: `${returnToBase}?state=${stateId}`, consumeNonce })
        if (!verified.ok) return fail(state.errorURL, USER_ERROR[verified.error], verified.error)
        const steamId = verified.steamId
        const profile = await fetchSteamProfile(steamId, options.webApiKey)
        const adapter = ctx.context.internalAdapter
        const existing = await adapter.findAccountByKey({ providerId: STEAM_PROVIDER_ID, accountId: steamId })

        // 3a. Connect Steam to the signed-in account.
        if (state.linkUserId) {
          const session = await getSessionFromCtx(ctx)
          if (!session || session.user.id !== state.linkUserId) return fail(state.errorURL, "state_mismatch", "link started by another session")
          if (existing && existing.userId !== state.linkUserId) return fail(state.errorURL, "account_already_linked_to_different_user", "steam id belongs to another user")
          if (!existing) {
            const other = await db.query.account.findFirst({
              where: and(eq(schema.account.userId, state.linkUserId), eq(schema.account.providerId, STEAM_PROVIDER_ID)),
              columns: { id: true },
            })
            if (other) return fail(state.errorURL, "steam_already_linked", "user has another steam account")
            const created = await adapter.createAccount({ userId: state.linkUserId, providerId: STEAM_PROVIDER_ID, accountId: steamId })
            await saveDisplayName(created.id, profile)
            const headers = ctx.request?.headers ?? ctx.headers
            await audit("link.added", { userId: state.linkUserId, ipAddress: requestIp(headers), userAgent: headers?.get("user-agent"), meta: { provider: STEAM_PROVIDER_ID } })
          } else {
            await saveDisplayName(existing.id, profile)
          }
          throw ctx.redirect(new URL(state.callbackURL, issuer).toString())
        }

        // 3b. Sign in, or sign up with a unique username from the persona name.
        let user = existing ? await adapter.findUserById(existing.userId) : null
        const isRegister = !user
        if (existing && !user) return fail(state.errorURL, "unable_to_link_account", "steam account without user")
        if (existing) {
          await saveDisplayName(existing.id, profile)
          // A Steam-only account without a picture takes the Steam avatar.
          if (user && !user.image && profile?.avatar && isPlaceholderEmail(user.email)) user = (await adapter.updateUser(user.id, { image: profile.avatar })) ?? user
        } else {
          if (state.disableSignUp) return fail(state.errorURL, "signup_disabled", "sign-up disabled for this flow")
          const persona = profile?.personaName ?? null
          const created = await runWithTransaction(ctx.context.adapter, async () => {
            const newUser = await adapter.createUser({
              name: persona ?? "Steam-Spieler",
              // Steam shares no email address: a placeholder that is never verified or mailed (lib/oidc/claims.ts).
              email: placeholderEmail(randomUUID()),
              emailVerified: false,
              image: profile?.avatar ?? null,
              // Seed for the unique Tretu username (made valid and unique in the user create hook of lib/auth.ts).
              displayUsername: persona ?? `steam_${steamId.slice(-6)}`,
            }, { method: "oauth", oauth: { providerId: STEAM_PROVIDER_ID, profile: { steamid: steamId, personaname: persona } } })
            const account = await adapter.createAccount({ userId: newUser.id, providerId: STEAM_PROVIDER_ID, accountId: steamId })
            return { newUser, account }
          })
          await saveDisplayName(created.account.id, profile)
          user = created.newUser
        }
        if (!user) return fail(state.errorURL, "unable_to_create_user", "no user")
        const session = await adapter.createSession(user.id)
        if (!session) return fail(state.errorURL, "unable_to_create_session", "no session")
        await setSessionCookie(ctx, { session, user })
        // Inside an app sign-in: back to the authorization endpoint, which now finds the fresh session.
        const target = state.oauthQuery ? authorizeContinuation(state.oauthQuery) : isRegister && state.newUserURL ? state.newUserURL : state.callbackURL
        throw ctx.redirect(new URL(target, issuer).toString())
      }),
    },
    rateLimit: [
      { pathMatcher: (path) => path === "/sign-in/steam" || path === "/steam/link", window: 60, max: 10 },
      { pathMatcher: (path) => path === "/steam/callback", window: 60, max: 20 },
    ],
  }
}
