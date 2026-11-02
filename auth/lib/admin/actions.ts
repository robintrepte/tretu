import { and, eq, ne, sql } from "drizzle-orm"
import type { Db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { adminMerge, mergeRefusal, planMerge, type AccountSummary, type MergePlan } from "@/lib/legacy/admin"
import { isPlaceholderEmail } from "@/lib/oidc/claims"
import { emitUserEvent } from "@/lib/tretu/events"
import { isAdmin } from "@/lib/users"
import { recordAdminAction, type AdminActor } from "./audit"
import { isLockActive, revokeAllAccess, type DbOrTx } from "./lock"

/*
 * The admin actions on Tretu-Konten, shared by the admin API (app/api/v1/admin/**) and `npm run admin`. Each one
 * checks its guards, changes the account in one transaction and then records the action (lib/admin/audit.ts) and
 * emits user.updated where the user shape (contract §2) changed. A request that changes nothing answers
 * `changed: false` and is neither recorded nor emitted.
 */

export interface ActionError {
  ok: false
  status: 403 | 404 | 409
  error: "not_found" | "self_action" | "last_admin" | "last_sign_in_method" | "no_email" | "merge_refused"
  message: string
}
export type ActionResult<T extends object = object> = ({ ok: true; changed: boolean } & T) | ActionError

const fail = (status: ActionError["status"], error: ActionError["error"], message: string): ActionError => ({ ok: false, status, error, message })
const notFound = () => fail(404, "not_found", "No Tretu-Konto with this sub")
const selfAction = (what: string) => fail(403, "self_action", `Admins cannot ${what} themselves`)
const lastAdmin = (what: string) => fail(409, "last_admin", `This is the last admin who is not locked: ${what} would leave Tretu without an admin`)

type UserRow = typeof s.user.$inferSelect
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Locks the target and every admin row for the rest of the transaction (so two admins demoting or locking each
 * other at the same time cannot leave Tretu without one) and tells whether another usable admin remains.
 */
async function lockAdminRows(tx: Tx, targetId: string): Promise<{ target: UserRow | null; otherActiveAdmin: boolean }> {
  const rows = await tx.execute<{ id: string; roles: string[]; locked: boolean; locked_until: Date | string | null }>(
    sql`select id, roles, locked, locked_until from "user" where id = ${targetId} or 'admin' = any(roles) order by id for update`,
  )
  const now = new Date()
  const otherActiveAdmin = [...rows].some(
    (r) => r.id !== targetId && isAdmin(r.roles) && !isLockActive({ locked: r.locked, lockedUntil: r.locked_until ? new Date(r.locked_until) : null }, now),
  )
  const target = (await tx.query.user.findFirst({ where: eq(s.user.id, targetId) })) ?? null
  return { target, otherActiveAdmin }
}

const label = (row: Pick<UserRow, "id" | "username" | "displayUsername">) => ({ id: row.id, username: row.displayUsername ?? row.username })
const isSelf = (actor: AdminActor, targetId: string) => actor.kind === "admin" && actor.sub === targetId

/* ───────────────────────── Roles ───────────────────────── */

export const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/

export async function changeRoles(
  db: Db,
  input: { actor: AdminActor; targetId: string; add?: string[]; remove?: string[]; reason: string },
): Promise<ActionResult<{ roles: string[] }>> {
  const add = [...new Set(input.add ?? [])]
  const remove = new Set(input.remove ?? [])
  const result = await db.transaction(async (tx): Promise<ActionResult<{ roles: string[]; before: string[]; target: UserRow }>> => {
    const { target, otherActiveAdmin } = await lockAdminRows(tx, input.targetId)
    if (!target) return notFound()
    const roles = [...new Set([...target.roles.filter((r) => !remove.has(r)), ...add])]
    const demoted = isAdmin(target.roles) && !isAdmin(roles)
    if (demoted && isSelf(input.actor, target.id)) return selfAction("remove the admin role from")
    if (demoted && !otherActiveAdmin) return lastAdmin("removing the admin role")
    const changed = roles.length !== target.roles.length || roles.some((r) => !target.roles.includes(r))
    if (changed) await tx.update(s.user).set({ roles }).where(eq(s.user.id, target.id))
    return { ok: true, changed, roles, before: target.roles, target }
  })
  if (!result.ok) return result
  if (result.changed) {
    const added = result.roles.filter((r) => !result.before.includes(r))
    const removed = result.before.filter((r) => !result.roles.includes(r))
    await recordAdminAction(db, { action: "roles_changed", actor: input.actor, target: label(result.target), reason: input.reason, details: { roles: result.roles, added, removed } })
    await emitUserEvent("user.updated", result.target.id, db)
  }
  return { ok: true, changed: result.changed, roles: result.roles }
}

/* ───────────────────────── Sessions ───────────────────────── */

export async function revokeSessions(db: Db, input: { actor: AdminActor; targetId: string; reason: string }): Promise<ActionResult<{ sessions: number; tokens: number }>> {
  const target = await db.query.user.findFirst({ where: eq(s.user.id, input.targetId) })
  if (!target) return notFound()
  const revoked = await db.transaction((tx) => revokeAllAccess(tx, target.id))
  const changed = revoked.sessions + revoked.tokens > 0
  if (changed) await recordAdminAction(db, { action: "sessions_revoked", actor: input.actor, target: label(target), reason: input.reason, details: revoked })
  return { ok: true, changed, ...revoked }
}

/* ───────────────────────── Lock ───────────────────────── */

export async function lockUser(
  db: Db,
  input: { actor: AdminActor; targetId: string; reason: string; until?: Date | null },
): Promise<ActionResult<{ lockedUntil: Date | null }>> {
  const until = input.until ?? null
  const result = await db.transaction(async (tx): Promise<ActionResult<{ wasActive: boolean; target: UserRow; revoked: { sessions: number; tokens: number } }>> => {
    const { target, otherActiveAdmin } = await lockAdminRows(tx, input.targetId)
    if (!target) return notFound()
    if (isSelf(input.actor, target.id)) return selfAction("lock")
    if (isAdmin(target.roles) && !otherActiveAdmin) return lastAdmin("locking this account")
    const wasActive = isLockActive(target)
    if (wasActive && target.lockedReason === input.reason && (target.lockedUntil?.getTime() ?? null) === (until?.getTime() ?? null)) {
      return { ok: true, changed: false, wasActive, target, revoked: { sessions: 0, tokens: 0 } }
    }
    await tx
      .update(s.user)
      .set({ locked: true, lockedReason: input.reason, lockedUntil: until, lockedAt: wasActive ? target.lockedAt : new Date() })
      .where(eq(s.user.id, target.id))
    const revoked = await revokeAllAccess(tx, target.id)
    return { ok: true, changed: true, wasActive, target, revoked }
  })
  if (!result.ok) return result
  if (result.changed) {
    await recordAdminAction(db, {
      action: "locked",
      actor: input.actor,
      target: label(result.target),
      reason: input.reason,
      details: { until: until?.toISOString() ?? null, ...result.revoked },
    })
    if (!result.wasActive) await emitUserEvent("user.updated", result.target.id, db)
  }
  return { ok: true, changed: result.changed, lockedUntil: until }
}

export async function unlockUser(db: Db, input: { actor: AdminActor; targetId: string; reason: string }): Promise<ActionResult> {
  const target = await db.query.user.findFirst({ where: eq(s.user.id, input.targetId) })
  if (!target) return notFound()
  const cleared = await db
    .update(s.user)
    .set({ locked: false, lockedReason: null, lockedUntil: null, lockedAt: null })
    .where(and(eq(s.user.id, target.id), eq(s.user.locked, true)))
    .returning({ id: s.user.id })
  if (!cleared.length) return { ok: true, changed: false }
  await recordAdminAction(db, { action: "unlocked", actor: input.actor, target: label(target), reason: input.reason })
  await emitUserEvent("user.updated", target.id, db)
  return { ok: true, changed: true }
}

/* ───────────────────────── Two-factor ───────────────────────── */

/** Removes TOTP and backup codes and signs the account out everywhere; an admin is asked to set it up again at the next sign-in. */
export async function resetTwoFactor(db: Db, input: { actor: AdminActor; targetId: string; reason: string }): Promise<ActionResult<{ sessions: number; tokens: number }>> {
  const result = await db.transaction(async (tx): Promise<ActionResult<{ target: UserRow; sessions: number; tokens: number }>> => {
    const target = await tx.query.user.findFirst({ where: eq(s.user.id, input.targetId) })
    if (!target) return notFound()
    const removed = await tx.delete(s.twoFactor).where(eq(s.twoFactor.userId, target.id)).returning({ id: s.twoFactor.id })
    if (!removed.length && !target.twoFactorEnabled) return { ok: true, changed: false, target, sessions: 0, tokens: 0 }
    await tx.update(s.user).set({ twoFactorEnabled: false }).where(eq(s.user.id, target.id))
    return { ok: true, changed: true, target, ...(await revokeAllAccess(tx, target.id)) }
  })
  if (!result.ok) return result
  const { target, changed, sessions, tokens } = result
  if (changed) await recordAdminAction(db, { action: "two_factor_reset", actor: input.actor, target: label(target), reason: input.reason, details: { sessions, tokens } })
  return { ok: true, changed, sessions, tokens }
}

/* ───────────────────────── Links ───────────────────────── */

/** Sign-in identities (`account` rows) and game links (`external_link` rows) an admin can remove. */
export const REMOVABLE_LINKS = ["discord", "google", "apple", "steam", "minecraft", "teamspeak"] as const
export type RemovableLink = (typeof REMOVABLE_LINKS)[number]
/** Providers that are part of the user shape's `links` (a change emits user.updated). */
const SHAPE_LINKS = new Set<RemovableLink>(["discord", "steam", "minecraft", "teamspeak"])

/** Whether the account keeps a way to sign in without the `account` row `exceptAccountId`: another one, or a passkey. */
export async function keepsASignInMethod(db: DbOrTx, userId: string, exceptAccountId: string): Promise<boolean> {
  const [others] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.account)
    .where(and(eq(s.account.userId, userId), ne(s.account.id, exceptAccountId)))
  if ((others?.n ?? 0) > 0) return true
  const [passkeys] = await db.select({ n: sql<number>`count(*)::int` }).from(s.passkey).where(eq(s.passkey.userId, userId))
  return (passkeys?.n ?? 0) > 0
}

export async function removeLink(db: Db, input: { actor: AdminActor; targetId: string; provider: RemovableLink; reason: string }): Promise<ActionResult> {
  const { provider } = input
  const result = await db.transaction(async (tx): Promise<ActionResult<{ target: UserRow; accountId: string | null }>> => {
    // The user row is locked so two removals at once cannot take away the last two sign-in methods.
    const [locked] = await tx.execute<{ id: string }>(sql`select id from "user" where id = ${input.targetId} for update`)
    const target = locked ? await tx.query.user.findFirst({ where: eq(s.user.id, input.targetId) }) : undefined
    if (!target) return notFound()
    if (provider === "minecraft" || provider === "teamspeak") {
      const removed = await tx
        .delete(s.externalLink)
        .where(and(eq(s.externalLink.userId, target.id), eq(s.externalLink.provider, provider)))
        .returning({ accountId: s.externalLink.providerAccountId })
      return { ok: true, changed: removed.length > 0, target, accountId: removed[0]?.accountId ?? null }
    }
    const row = await tx.query.account.findFirst({ where: and(eq(s.account.userId, target.id), eq(s.account.providerId, provider)), columns: { id: true, accountId: true } })
    if (!row) return { ok: true, changed: false, target, accountId: null }
    if (!(await keepsASignInMethod(tx, target.id, row.id))) return fail(409, "last_sign_in_method", `${provider} is the only way this account signs in`)
    await tx.delete(s.account).where(eq(s.account.id, row.id))
    return { ok: true, changed: true, target, accountId: row.accountId }
  })
  if (!result.ok) return result
  if (result.changed) {
    await recordAdminAction(db, { action: "link_removed", actor: input.actor, target: label(result.target), reason: input.reason, details: { provider, accountId: result.accountId } })
    if (SHAPE_LINKS.has(provider)) await emitUserEvent("user.updated", result.target.id, db)
  }
  return { ok: true, changed: result.changed }
}

/* ───────────────────────── Email ───────────────────────── */

export async function verifyEmail(db: Db, input: { actor: AdminActor; targetId: string; reason: string }): Promise<ActionResult> {
  const target = await db.query.user.findFirst({ where: eq(s.user.id, input.targetId) })
  if (!target) return notFound()
  if (isPlaceholderEmail(target.email)) return fail(409, "no_email", "This account has no email address")
  if (target.emailVerified) return { ok: true, changed: false }
  await db.update(s.user).set({ emailVerified: true }).where(eq(s.user.id, target.id))
  await recordAdminAction(db, { action: "email_verified", actor: input.actor, target: label(target), reason: input.reason, details: { email: target.email } })
  return { ok: true, changed: true }
}

/* ───────────────────────── Merge ───────────────────────── */

const MERGE_REFUSALS = {
  same: "from and into are the same account",
  fromAdmin: "from has the admin role; remove it first if this account really should go",
} as const

/** Merges an old account into another (lib/legacy/admin.ts); `dryRun` only returns what would happen. */
export async function mergeAccounts(
  db: Db,
  input: { actor: AdminActor; fromId: string; intoId: string; reason: string; dryRun: boolean },
): Promise<ActionResult<{ dryRun: boolean; plan: MergePlan; after: AccountSummary | null }>> {
  const [from, into] = await Promise.all([
    db.query.user.findFirst({ where: eq(s.user.id, input.fromId) }),
    db.query.user.findFirst({ where: eq(s.user.id, input.intoId) }),
  ])
  if (!from || !into) return notFound()
  const refusal = mergeRefusal(from, into)
  if (refusal) return fail(409, "merge_refused", MERGE_REFUSALS[refusal])
  if (input.dryRun) return { ok: true, changed: false, dryRun: true, plan: await planMerge(db, from.id, into.id), after: null }
  const { plan, after } = await adminMerge(db, from, into, { actor: input.actor, reason: input.reason })
  return { ok: true, changed: true, dryRun: false, plan, after }
}
