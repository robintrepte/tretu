import { timingSafeEqual } from "node:crypto"
import { createOTP } from "@better-auth/utils/otp"
import { and, eq, isNull, lt, or } from "drizzle-orm"
import type { Db } from "@/lib/db"
import { twoFactor } from "@/lib/db/schema"

/**
 * TOTP replay protection (RFC 6238 §5.2): a code is accepted at most once per user. Better Auth's
 * `/two-factor/verify-totp` — the only place a TOTP is verified (sign-in challenge, turning 2FA on, re-checks of a
 * signed-in user) — accepts the current time step ±1 and does not remember used ones. The tretu plugin's before hook
 * finds the time step the submitted code belongs to and claims it with one conditional UPDATE: it succeeds only if
 * the step is newer than the last accepted one, so the same code twice, an older code after a newer one, and two
 * concurrent submissions of one code are all refused except for the first.
 */

/** Better Auth's TOTP defaults (30 s period, 6 digits, ±1 step drift). */
export const TOTP_PERIOD_SECONDS = 30
export const TOTP_WINDOW = 1
const DIGITS = 6

/** The time step (counter) a code belongs to within the accepted window, or null if it matches none. */
export async function matchingCounter(secret: string | Uint8Array, code: string, now = Date.now()): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null
  const otp = createOTP(secret as string, { digits: DIGITS, period: TOTP_PERIOD_SECONDS })
  const current = Math.floor(now / (TOTP_PERIOD_SECONDS * 1000))
  let found: number | null = null
  // Every step is computed (no early exit), like Better Auth's own check; the newest match wins.
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    if (timingSafeEqual(Buffer.from(await otp.hotp(step)), Buffer.from(code))) found = step
  }
  return found
}

/** Claims `counter` for the user's TOTP. False if this or a newer step was already accepted. */
export async function claimTotpCounter(db: Db, userId: string, counter: number): Promise<boolean> {
  const rows = await db
    .update(twoFactor)
    .set({ lastTotpCounter: counter })
    .where(and(eq(twoFactor.userId, userId), or(isNull(twoFactor.lastTotpCounter), lt(twoFactor.lastTotpCounter, counter))))
    .returning({ id: twoFactor.id })
  return rows.length > 0
}
