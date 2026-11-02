import { and, eq, isNotNull, lte, sql } from "drizzle-orm"
import { audit } from "@/lib/audit"
import { db as defaultDb, type Db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { emitUserEvent } from "@/lib/tretu/events"
import { isLockActive } from "@/lib/users"

/*
 * Account lock (admin API: POST /api/v1/admin/users/{sub}/lock). A locked account cannot sign in by any method:
 * every new session is refused (databaseHooks.session.create in lib/auth.ts), existing sessions, app tokens and
 * pending authorization codes are revoked when the lock is set, and the OIDC endpoints refuse a locked user.
 * `lockedUntil` ends a lock by itself: the event worker lifts expired locks (with user.updated), and a sign-in
 * attempt after the date lifts it on the spot.
 */

export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

export { isLockActive }

/** The error code every refused sign-in carries (JSON body `code`, or `?error=` on redirects). */
export const ACCOUNT_LOCKED = "ACCOUNT_LOCKED"

/**
 * The lock in force for a user, or null. A lock that has run out is lifted on the way (audit + user.updated), so
 * the sign-in that noticed it goes through.
 */
export async function activeLock(userId: string, db: Db = defaultDb): Promise<{ until: Date | null } | null> {
  const row = await db.query.user.findFirst({ where: eq(s.user.id, userId), columns: { locked: true, lockedUntil: true } })
  if (!row?.locked) return null
  if (isLockActive(row)) return { until: row.lockedUntil }
  await liftExpiredLocks(db, userId)
  return null
}

/**
 * Lifts every lock whose `lockedUntil` has passed (or only the one of `userId`). Each row is cleared by exactly one
 * caller (UPDATE … RETURNING), which writes the activity entry and emits user.updated `{ locked: false }`.
 */
export async function liftExpiredLocks(db: Db = defaultDb, userId?: string, now: Date = new Date()): Promise<string[]> {
  const lifted = await db
    .update(s.user)
    .set({ locked: false, lockedReason: null, lockedUntil: null, lockedAt: null })
    .where(and(eq(s.user.locked, true), isNotNull(s.user.lockedUntil), lte(s.user.lockedUntil, now), userId ? eq(s.user.id, userId) : undefined))
    .returning({ id: s.user.id })
  for (const { id } of lifted) {
    await audit("lock.expired", { userId: id }, db)
    await emitUserEvent("user.updated", id, db)
  }
  return lifted.map((r) => r.id)
}

/**
 * Ends every way a user is signed in: auth.tretu.de sessions, the apps' access and refresh tokens, authorization
 * codes not yet exchanged, pending second-factor challenges and "trusted device" tokens.
 */
export async function revokeAllAccess(db: DbOrTx, userId: string): Promise<{ sessions: number; tokens: number }> {
  const access = await db.delete(s.oauthAccessToken).where(eq(s.oauthAccessToken.userId, userId)).returning({ id: s.oauthAccessToken.id })
  const refresh = await db.delete(s.oauthRefreshToken).where(eq(s.oauthRefreshToken.userId, userId)).returning({ id: s.oauthRefreshToken.id })
  const sessions = await db.delete(s.session).where(eq(s.session.userId, userId)).returning({ id: s.session.id })
  // Authorization codes are verification rows holding a JSON value (oauth-provider plugin); other rows may hold
  // plain strings, so the JSON is only parsed for code rows (CASE keeps the order of evaluation).
  await db.execute(sql`
    delete from verification
    where value like '{"type":"authorization_code"%'
      and (case when value like '{"type":"authorization_code"%' then value::jsonb ->> 'userId' end) = ${userId}`)
  await db.execute(sql`delete from verification where (identifier like '2fa-%' or identifier like 'trust-device-%') and value = ${userId}`)
  return { sessions: sessions.length, tokens: access.length + refresh.length }
}
