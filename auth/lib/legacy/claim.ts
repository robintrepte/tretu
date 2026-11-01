import { and, eq, or, sql } from "drizzle-orm"
import type { Db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { verifyStoredPassword } from "@/lib/passwords"
import { isUnusedAccount, mergeUsers } from "./merge"

export const CLAIMABLE_APPS = ["saga", "play", "hollowmere", "tretu-web"] as const
export type ClaimableApp = (typeof CLAIMABLE_APPS)[number]

export type ClaimResult =
  | { ok: true; app: ClaimableApp; legacyName: string }
  | { ok: false; error: "notFound" | "alreadyYours" | "inUse" | "expired" }

/** Whether a legacy link from the import can still be claimed (LEGACY_CLAIM_DAYS after the import). */
export function claimWindowOpen(importedAt: Date, days: number, now = new Date()): boolean {
  return now.getTime() - importedAt.getTime() <= days * 86_400_000
}

/**
 * The claim flow of "Alte Konten verbinden": a signed-in user proves an old account's password; the separate
 * Tretu account the import created for it is merged into theirs. Wrong identifier and wrong password give the
 * same answer, so the form cannot be used to find out who had an account.
 */
export async function claimWithPassword(
  db: Db,
  input: { userId: string; app: ClaimableApp; identifier: string; password: string; claimDays: number },
): Promise<ClaimResult> {
  const identifier = input.identifier.trim().toLowerCase()
  if (!identifier || !input.password) return { ok: false, error: "notFound" }
  const candidates = await db
    .select()
    .from(s.legacyLink)
    .where(
      and(
        eq(s.legacyLink.app, input.app),
        or(sql`lower(${s.legacyLink.legacyUsername}) = ${identifier}`, sql`lower(${s.legacyLink.legacyEmail}) = ${identifier}`),
      ),
    )
    .limit(5)
  for (const link of candidates) {
    if (!(await verifyStoredPassword(link.passwordHash, input.password))) continue
    if (link.userId === input.userId) return { ok: false, error: "alreadyYours" }
    if (!claimWindowOpen(link.importedAt, input.claimDays)) return { ok: false, error: "expired" }
    if (!(await isUnusedAccount(db, link.userId))) return { ok: false, error: "inUse" }
    // Never pull in an account that also holds links to other apps owned by someone else's proof:
    // the merge moves the whole imported account, which by construction is one person.
    await mergeUsers(db, link.userId, input.userId)
    return { ok: true, app: input.app, legacyName: link.legacyUsername ?? link.legacyEmail ?? link.legacyUserId }
  }
  return { ok: false, error: "notFound" }
}

/**
 * The OAuth variant: the user signed in with a provider identity that belongs to another (imported) account
 * while a claim was pending for `targetUserId`. `currentUserId` is that other account.
 */
export async function claimWithSession(
  db: Db,
  input: { targetUserId: string; currentUserId: string; claimDays: number },
): Promise<{ ok: true } | { ok: false; error: "notFound" | "inUse" | "expired" }> {
  if (input.targetUserId === input.currentUserId) return { ok: false, error: "notFound" }
  const target = await db.query.user.findFirst({ where: eq(s.user.id, input.targetUserId), columns: { id: true } })
  const current = await db.query.user.findFirst({ where: eq(s.user.id, input.currentUserId) })
  if (!target || !current) return { ok: false, error: "notFound" }
  if (current.twoFactorEnabled || current.roles.length) return { ok: false, error: "inUse" }
  const links = await db.select().from(s.legacyLink).where(eq(s.legacyLink.userId, current.id))
  const freshlyCreated = Date.now() - current.createdAt.getTime() < 10 * 60_000
  if (!links.length && !freshlyCreated) return { ok: false, error: "notFound" }
  if (links.length && !links.some((l) => claimWindowOpen(l.importedAt, input.claimDays))) return { ok: false, error: "expired" }
  if (!(await isUnusedAccount(db, current.id))) return { ok: false, error: "inUse" }
  await mergeUsers(db, current.id, target.id)
  return { ok: true }
}

export async function legacyLinksOf(db: Db, userId: string) {
  return db
    .select({ app: s.legacyLink.app, legacyUsername: s.legacyLink.legacyUsername, legacyEmail: s.legacyLink.legacyEmail, importedAt: s.legacyLink.importedAt })
    .from(s.legacyLink)
    .where(eq(s.legacyLink.userId, userId))
}
