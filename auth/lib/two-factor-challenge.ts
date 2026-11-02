import type { GenericEndpointContext } from "@better-auth/core"
import { createHMAC } from "@better-auth/utils/hmac"
import { deleteSessionCookie, expireCookie } from "better-auth/cookies"
import { generateRandomString } from "better-auth/crypto"

/**
 * The second factor for sign-ins Better Auth's two-factor plugin does not challenge itself (Discord, Google,
 * Apple, Steam, magic links and email confirmation links). It uses the plugin's own mechanism, exactly as the
 * plugin does after a password sign-in:
 *
 * - the session the provider sign-in just created is deleted and its cookies are expired, so nothing (no app,
 *   no OIDC code, not /konto, not the API) can use it;
 * - a signed `two_factor` challenge cookie (10 minutes, one-time verification row) is set instead;
 * - `/two-factor/verify-totp` and `/two-factor/verify-backup-code` turn that challenge into a new session.
 *
 * A device the user trusted at an earlier code entry ("Diesem Gerät 30 Tage vertrauen") skips the code, as it
 * does for password sign-ins; the trust token is rotated on every use.
 */

/** Cookie names and lifetimes of Better Auth's two-factor plugin (plugins/two-factor/constant). */
const TWO_FACTOR_COOKIE = "two_factor"
const TRUST_DEVICE_COOKIE = "trust_device"
const CHALLENGE_SECONDS = 600
const TRUST_DEVICE_SECONDS = 30 * 24 * 60 * 60

const sign = (secret: string, value: string) => createHMAC("SHA-256", "base64urlnopad").sign(secret, value)

/** Whether this browser holds a valid "trust this device" token for the user (rotated when it does). */
export async function consumeTrustedDevice(ctx: GenericEndpointContext, userId: string): Promise<boolean> {
  const cookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE, { maxAge: TRUST_DEVICE_SECONDS })
  const value = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
  if (!value) return false
  const [token, identifier] = value.split("!")
  if (token && identifier && token === (await sign(ctx.context.secret, `${userId}!${identifier}`))) {
    const record = await ctx.context.internalAdapter.findVerificationValue(identifier)
    if (record && record.value === userId && record.expiresAt > new Date()) {
      await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier)
      const next = `trust-device-${generateRandomString(32)}`
      await ctx.context.internalAdapter.createVerificationValue({ value: userId, identifier: next, expiresAt: new Date(Date.now() + TRUST_DEVICE_SECONDS * 1000) })
      await ctx.setSignedCookie(cookie.name, `${await sign(ctx.context.secret, `${userId}!${next}`)}!${next}`, ctx.context.secret, cookie.attributes)
      return true
    }
  }
  expireCookie(ctx, cookie)
  return false
}

/** The user a pending challenge (signed `two_factor` cookie) belongs to, for the activity log. */
export async function challengeUserId(ctx: GenericEndpointContext): Promise<string | null> {
  const identifier = await ctx.getSignedCookie(ctx.context.createAuthCookie(TWO_FACTOR_COOKIE).name, ctx.context.secret)
  if (!identifier) return null
  return (await ctx.context.internalAdapter.findVerificationValue(identifier))?.value ?? null
}

/** Replaces the session that was just created with a pending second-factor challenge. */
export async function replaceSessionWithChallenge(ctx: GenericEndpointContext, session: { token: string; userId: string }): Promise<void> {
  deleteSessionCookie(ctx, true)
  await ctx.context.internalAdapter.deleteSession(session.token)
  ctx.context.setNewSession(null)
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE, { maxAge: CHALLENGE_SECONDS })
  const identifier = `2fa-${generateRandomString(20)}`
  const expiresAt = new Date(Date.now() + CHALLENGE_SECONDS * 1000)
  await ctx.context.internalAdapter.createVerificationValue({ value: session.userId, identifier, expiresAt })
  // The plugin counts wrong codes per challenge in this row (see verifyTwoFactor's beginAttempt).
  await ctx.context.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt })
  await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes)
}
