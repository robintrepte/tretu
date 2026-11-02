import { and, eq, inArray, sql } from "drizzle-orm"
import type { Db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { emitUserDeleted, emitUserEvent } from "@/lib/tretu/events"

/**
 * Whether an account may still be merged into another one: it must never have been used with any app
 * (no OAuth tokens or consents), so no app has stored its `sub` yet.
 */
export async function isUnusedAccount(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.execute<{ used: boolean }>(sql`
    select exists(select 1 from oauth_refresh_token where user_id = ${userId})
        or exists(select 1 from oauth_access_token where user_id = ${userId})
        or exists(select 1 from oauth_consent where user_id = ${userId}) as used`)
  return !row?.used
}

/**
 * Moves everything of `fromId` that `intoId` does not already have onto `intoId`, then deletes `fromId`.
 * Emits user.updated for the target and user.deleted (data `{ mergedInto }`) for the merged account.
 */
export async function mergeUsers(db: Db, fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) throw new Error("cannot merge an account into itself")
  await db.transaction(async (tx) => {
    await tx.update(s.legacyLink).set({ userId: intoId, method: "admin", claimedAt: new Date() }).where(eq(s.legacyLink.userId, fromId))

    const targetProviders = new Set(
      (await tx.select({ providerId: s.account.providerId }).from(s.account).where(eq(s.account.userId, intoId))).map((a) => a.providerId),
    )
    const sourceAccounts = await tx.select().from(s.account).where(eq(s.account.userId, fromId))
    const movable = sourceAccounts.filter((a) => !targetProviders.has(a.providerId)).map((a) => a.id)
    if (movable.length) await tx.update(s.account).set({ userId: intoId }).where(inArray(s.account.id, movable))

    const targetLinks = new Set(
      (await tx.select({ provider: s.externalLink.provider }).from(s.externalLink).where(eq(s.externalLink.userId, intoId))).map((l) => l.provider),
    )
    for (const link of await tx.select().from(s.externalLink).where(eq(s.externalLink.userId, fromId))) {
      if (!targetLinks.has(link.provider)) await tx.update(s.externalLink).set({ userId: intoId }).where(eq(s.externalLink.id, link.id))
    }
    await tx.update(s.passkey).set({ userId: intoId }).where(eq(s.passkey.userId, fromId))
    await tx.delete(s.user).where(and(eq(s.user.id, fromId)))
  })
  await emitUserEvent("user.updated", intoId, db)
  await emitUserDeleted(fromId, intoId, db)
}
