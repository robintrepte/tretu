import { createHmac, timingSafeEqual } from "node:crypto"
import { env, isHttps } from "@/lib/env"

export const RENAME_INTERVAL_DAYS = 30

/** Cookie that remembers a pending "prove with Discord/Google" claim (see app/konto/alte-konten/abschluss). */
export const CLAIM_COOKIE = isHttps ? "__Host-tretu.legacy_claim" : "tretu.legacy_claim"

export function signClaim(payload: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(`legacy-claim:${payload}`).digest("base64url")
}

/** Returns the user id of a valid, unexpired claim cookie value, else null. */
export function readClaim(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null
  const parts = value.split(".")
  if (parts.length !== 3) return null
  const [userId, expires, signature] = parts as [string, string, string]
  const expected = Buffer.from(signClaim(`${userId}.${expires}`))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return Number(expires) > now ? userId : null
}
