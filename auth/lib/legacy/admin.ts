import { eq, or, sql } from "drizzle-orm"
import { CLI_ACTOR, recordAdminAction, type AdminActor } from "@/lib/admin/audit"
import type { Db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { isPlaceholderEmail } from "@/lib/oidc/claims"
import { isAdmin } from "@/lib/users"
import { isUnusedAccount, mergeUsers } from "./merge"

/*
 * The admin side of old accounts (`npm run admin -- legacy | merge`): there is no self-service claim; the few
 * old accounts the import could not join automatically are merged by hand.
 */

type UserRow = typeof s.user.$inferSelect

/** A user by username or email (case-insensitive). */
export async function findUser(db: Db, who: string): Promise<UserRow | null> {
  const key = who.trim().toLowerCase()
  if (!key) return null
  return (await db.query.user.findFirst({ where: or(eq(s.user.username, key), sql`lower(${s.user.email}) = ${key}`) })) ?? null
}

export interface UserMatch {
  id: string
  username: string | null
  email: string | null
}

/** Accounts whose username or email is close to `who` (for "did you mean"). Reads every user: a CLI helper only. */
export async function closeMatches(db: Db, who: string, limit = 5): Promise<UserMatch[]> {
  const key = who.trim().toLowerCase()
  if (!key) return []
  const rows = await db.select({ id: s.user.id, username: s.user.username, displayUsername: s.user.displayUsername, email: s.user.email }).from(s.user)
  const threshold = Math.max(2, Math.floor(key.length / 3))
  return rows
    .map((row) => {
      const email = isPlaceholderEmail(row.email) ? null : row.email.toLowerCase()
      const candidates = [row.username, email, email?.split("@")[0]].filter((c): c is string => Boolean(c))
      const contains = candidates.some((c) => c.includes(key) || (c.length >= 3 && key.includes(c)))
      const distance = Math.min(...candidates.map((c) => levenshtein(key, c)), contains ? 1 : Infinity)
      return { match: { id: row.id, username: row.displayUsername ?? row.username, email }, distance }
    })
    .filter((r) => r.distance <= threshold)
    .sort((a, b) => a.distance - b.distance || (a.match.username ?? "").localeCompare(b.match.username ?? ""))
    .slice(0, limit)
    .map((r) => r.match)
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = current
  }
  return previous[b.length]!
}

export interface AccountSummary {
  id: string
  username: string | null
  /** null for the placeholder address of accounts without an email. */
  email: string | null
  emailVerified: boolean
  createdAt: Date
  lastLoginAt: Date | null
  roles: string[]
  twoFactor: boolean
  /** Sign-in methods (`credential` = password). */
  providers: { id: string; providerId: string; accountId: string; displayName: string | null }[]
  gameLinks: { id: string; provider: string; providerAccountId: string; displayName: string | null }[]
  passkeys: { id: string; name: string | null; createdAt: Date | null }[]
  legacy: { id: string; app: string; legacyUserId: string; legacyUsername: string | null; legacyEmail: string | null; method: string }[]
  /** Signed in to an app at least once (an app may hold data under this sub). */
  usedByApps: boolean
  sessions: number
}

export async function accountSummary(db: Db, userId: string): Promise<AccountSummary | null> {
  const user = await db.query.user.findFirst({ where: eq(s.user.id, userId) })
  if (!user) return null
  const [providers, gameLinks, passkeys, legacy, [sessions], unused] = await Promise.all([
    db
      .select({ id: s.account.id, providerId: s.account.providerId, accountId: s.account.accountId, displayName: s.account.displayName })
      .from(s.account)
      .where(eq(s.account.userId, userId))
      .orderBy(s.account.providerId),
    db
      .select({ id: s.externalLink.id, provider: s.externalLink.provider, providerAccountId: s.externalLink.providerAccountId, displayName: s.externalLink.displayName })
      .from(s.externalLink)
      .where(eq(s.externalLink.userId, userId))
      .orderBy(s.externalLink.provider),
    db.select({ id: s.passkey.id, name: s.passkey.name, createdAt: s.passkey.createdAt }).from(s.passkey).where(eq(s.passkey.userId, userId)),
    db
      .select({
        id: s.legacyLink.id,
        app: s.legacyLink.app,
        legacyUserId: s.legacyLink.legacyUserId,
        legacyUsername: s.legacyLink.legacyUsername,
        legacyEmail: s.legacyLink.legacyEmail,
        method: s.legacyLink.method,
      })
      .from(s.legacyLink)
      .where(eq(s.legacyLink.userId, userId))
      .orderBy(s.legacyLink.app),
    db.select({ n: sql<number>`count(*)::int` }).from(s.session).where(eq(s.session.userId, userId)),
    isUnusedAccount(db, userId),
  ])
  return {
    id: user.id,
    username: user.displayUsername ?? user.username,
    email: isPlaceholderEmail(user.email) ? null : user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    roles: user.roles,
    twoFactor: Boolean(user.twoFactorEnabled),
    providers,
    gameLinks,
    passkeys,
    legacy,
    usedByApps: !unused,
    sessions: sessions?.n ?? 0,
  }
}

export type MergeRefusal = "same" | "fromAdmin"

/** Merges the CLI refuses: an account into itself, and removing an admin account. */
export function mergeRefusal(from: Pick<UserRow, "id" | "roles">, into: Pick<UserRow, "id">): MergeRefusal | null {
  if (from.id === into.id) return "same"
  if (isAdmin(from.roles)) return "fromAdmin"
  return null
}

export interface MergePlan {
  from: AccountSummary
  into: AccountSummary
  move: Pick<AccountSummary, "providers" | "gameLinks" | "passkeys" | "legacy">
  /** Deleted with `from` because `into` already has one of the same kind. */
  drop: Pick<AccountSummary, "providers" | "gameLinks">
}

/** What `mergeUsers(db, fromId, intoId)` would do, without changing anything (mirrors its rules). */
export async function planMerge(db: Db, fromId: string, intoId: string): Promise<MergePlan> {
  const [from, into] = await Promise.all([accountSummary(db, fromId), accountSummary(db, intoId)])
  if (!from || !into) throw new Error("unknown account")
  const intoProviders = new Set(into.providers.map((p) => p.providerId))
  const intoGames = new Set(into.gameLinks.map((g) => g.provider))
  return {
    from,
    into,
    move: {
      providers: from.providers.filter((p) => !intoProviders.has(p.providerId)),
      gameLinks: from.gameLinks.filter((g) => !intoGames.has(g.provider)),
      passkeys: from.passkeys,
      legacy: from.legacy,
    },
    drop: {
      providers: from.providers.filter((p) => intoProviders.has(p.providerId)),
      gameLinks: from.gameLinks.filter((g) => intoGames.has(g.provider)),
    },
  }
}

/**
 * Merges `from` into `into` (mergeUsers: user.updated for `into`, user.deleted `{ mergedInto }` for `from`, so the
 * platform moves wallet and stats and the apps clean up) and records `admin.merge` in the target's activity log
 * (and `admin.performed` in the acting admin's).
 */
export async function adminMerge(
  db: Db,
  from: UserRow,
  into: UserRow,
  by: { actor: AdminActor; reason: string } = { actor: CLI_ACTOR, reason: "CLI" },
): Promise<{ plan: MergePlan; after: AccountSummary }> {
  const refusal = mergeRefusal(from, into)
  if (refusal) throw new Error(`merge refused: ${refusal}`)
  const plan = await planMerge(db, from.id, into.id)
  await mergeUsers(db, from.id, into.id)
  await recordAdminAction(db, {
    action: "merge",
    actor: by.actor,
    target: { id: into.id, username: plan.into.username },
    reason: by.reason,
    details: {
      from: from.id,
      fromUsername: plan.from.username,
      moved: {
        providers: plan.move.providers.map((p) => p.providerId),
        gameLinks: plan.move.gameLinks.map((g) => g.provider),
        passkeys: plan.move.passkeys.length,
        legacy: plan.move.legacy.map((l) => `${l.app}:${l.legacyUserId}`),
      },
      dropped: { providers: plan.drop.providers.map((p) => p.providerId), gameLinks: plan.drop.gameLinks.map((g) => g.provider) },
    },
  })
  const after = await accountSummary(db, into.id)
  if (!after) throw new Error("target account vanished during the merge")
  return { plan, after }
}

export interface LegacyCandidate {
  account: AccountSummary
  /** Other accounts that may belong to the same person (same email, or the same name up to a `_2` suffix). */
  possibleMatches: (UserMatch & { reasons: ("email" | "username")[] })[]
}

const nameStem = (name: string) => name.toLowerCase().replace(/_\d{1,4}$/, "")

/**
 * Accounts with old-app links that no admin merge touched yet (the import created or joined them), each with
 * the accounts that may be the same person, so the owner can decide what to merge.
 */
export async function listLegacyAccounts(db: Db): Promise<LegacyCandidate[]> {
  const [users, links] = await Promise.all([
    db.select({ id: s.user.id, username: s.user.username, displayUsername: s.user.displayUsername, email: s.user.email, createdAt: s.user.createdAt }).from(s.user),
    db.select({ userId: s.legacyLink.userId, legacyUsername: s.legacyLink.legacyUsername, legacyEmail: s.legacyLink.legacyEmail, method: s.legacyLink.method }).from(s.legacyLink),
  ])
  const byEmail = new Map<string, Set<string>>()
  const byName = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, key: string | null | undefined, userId: string) => {
    if (!key) return
    const set = map.get(key) ?? new Set<string>()
    set.add(userId)
    map.set(key, set)
  }
  const emailsOf = new Map<string, Set<string>>()
  const namesOf = new Map<string, Set<string>>()
  const remember = (userId: string, email: string | null | undefined, name: string | null | undefined) => {
    const e = email && !isPlaceholderEmail(email) ? email.toLowerCase() : null
    const n = name ? nameStem(name) : null
    add(byEmail, e, userId)
    add(byName, n, userId)
    if (e) emailsOf.set(userId, (emailsOf.get(userId) ?? new Set()).add(e))
    if (n) namesOf.set(userId, (namesOf.get(userId) ?? new Set()).add(n))
  }
  for (const u of users) remember(u.id, u.email, u.username)
  for (const l of links) remember(l.userId, l.legacyEmail, l.legacyUsername)

  const linked = new Set(links.map((l) => l.userId))
  const touched = new Set(links.filter((l) => l.method === "admin").map((l) => l.userId))
  const candidates = users.filter((u) => linked.has(u.id) && !touched.has(u.id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const userById = new Map(users.map((u) => [u.id, u]))

  const result: LegacyCandidate[] = []
  for (const candidate of candidates) {
    const account = await accountSummary(db, candidate.id)
    if (!account) continue
    const reasons = new Map<string, Set<"email" | "username">>()
    const note = (ids: Set<string> | undefined, reason: "email" | "username") => {
      for (const id of ids ?? []) if (id !== candidate.id) reasons.set(id, (reasons.get(id) ?? new Set()).add(reason))
    }
    for (const e of emailsOf.get(candidate.id) ?? []) note(byEmail.get(e), "email")
    for (const n of namesOf.get(candidate.id) ?? []) note(byName.get(n), "username")
    const possibleMatches = [...reasons].map(([id, why]) => {
      const u = userById.get(id)!
      return { id, username: u.displayUsername ?? u.username, email: isPlaceholderEmail(u.email) ? null : u.email, reasons: [...why].sort() }
    })
    result.push({ account, possibleMatches })
  }
  // The ones that may belong to someone else's account first.
  return result.sort((a, b) => Number(b.possibleMatches.length > 0) - Number(a.possibleMatches.length > 0))
}

/* ───────────────────────── CLI output ───────────────────────── */

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never")
const list = (items: string[]) => (items.length ? items.join(", ") : "–")
const provider = (p: AccountSummary["providers"][number]) =>
  p.providerId === "credential" ? "password" : `${p.providerId} ${p.accountId}${p.displayName ? ` (${p.displayName})` : ""}`
const game = (g: AccountSummary["gameLinks"][number]) => `${g.provider} ${g.providerAccountId}${g.displayName ? ` (${g.displayName})` : ""}`
const passkey = (p: AccountSummary["passkeys"][number]) => `${p.name ?? "Passkey"} (${day(p.createdAt)})`
const legacyLine = (l: AccountSummary["legacy"][number]) =>
  `${l.app}: ${l.legacyUsername ?? l.legacyUserId}${l.legacyEmail ? ` <${l.legacyEmail}>` : ""}`
const userLabel = (u: { username: string | null; email: string | null }) => `${u.username ?? "–"}${u.email ? ` <${u.email}>` : ""}`

export function formatAccount(a: AccountSummary, indent = "  "): string {
  return [
    `${indent}email      ${a.email ? `${a.email} (${a.emailVerified ? "verified" : "not verified"})` : "– (no email)"}`,
    `${indent}created    ${day(a.createdAt)} · last sign-in ${day(a.lastLoginAt)} · sessions ${a.sessions}`,
    `${indent}roles      ${list(a.roles)} · 2FA ${a.twoFactor ? "on" : "off"} · used with an app: ${a.usedByApps ? "yes" : "no"}`,
    `${indent}sign-in    ${list(a.providers.map(provider))}`,
    `${indent}games      ${list(a.gameLinks.map(game))}`,
    `${indent}passkeys   ${list(a.passkeys.map(passkey))}`,
    `${indent}old apps   ${list(a.legacy.map(legacyLine))}`,
  ].join("\n")
}

export function formatMergePlan(plan: MergePlan, options: { dryRun: boolean }): string {
  const { from, into, move, drop } = plan
  const fromName = from.username ?? from.id
  const intoName = into.username ?? into.id
  const lines = [
    `Merge ${fromName} into ${intoName}${options.dryRun ? " (DRY RUN, nothing changed)" : ""}`,
    "",
    `FROM ${fromName} (${from.id}): deleted after the merge`,
    formatAccount(from),
    "",
    `INTO ${intoName} (${into.id}): keeps its username, email, profile, password, 2FA and roles`,
    formatAccount(into),
    "",
    `Moves to ${intoName}:`,
    `  sign-in    ${list(move.providers.map(provider))}`,
    `  games      ${list(move.gameLinks.map(game))}`,
    `  passkeys   ${list(move.passkeys.map(passkey))}`,
    `  old apps   ${list(move.legacy.map(legacyLine))}`,
    "",
    `Dropped (${intoName} already has one):`,
    `  sign-in    ${list(drop.providers.map(provider))}`,
    `  games      ${list(drop.gameLinks.map(game))}`,
    "",
    `Deleted with ${fromName}: its username, email, name and picture, ${from.sessions} session(s), 2FA settings, app consents and tokens, activity log.`,
    `Events: user.updated for ${intoName}, user.deleted { mergedInto: ${into.id} } for ${fromName} (the platform moves wallet and stats).`,
  ]
  if (from.usedByApps) lines.push(`Note: ${fromName} was used with an app; the apps drop that local user on user.deleted.`)
  if (options.dryRun) lines.push("", "Run again with --yes to merge.")
  return lines.join("\n")
}

export function formatLegacyList(candidates: LegacyCandidate[]): string {
  if (!candidates.length) return "No imported accounts left to review."
  const lines = [`Imported accounts no admin merge touched yet: ${candidates.length}`, ""]
  for (const { account, possibleMatches } of candidates) {
    lines.push(`${account.username ?? "–"} (${account.id})`)
    lines.push(`  email      ${account.email ?? "– (no email)"}`)
    lines.push(`  created    ${day(account.createdAt)} · last sign-in ${day(account.lastLoginAt)} · used with an app: ${account.usedByApps ? "yes" : "no"}`)
    lines.push(`  old apps   ${list(account.legacy.map(legacyLine))}`)
    if (possibleMatches.length) lines.push(`  maybe      ${possibleMatches.map((m) => `${userLabel(m)} [${m.reasons.join("+")}]`).join(", ")}`)
    lines.push("")
  }
  lines.push("Merge one into another with: npm run admin -- merge <from> <into>   (dry run; add --yes to merge)")
  return lines.join("\n")
}

export function formatMatches(matches: UserMatch[]): string {
  return matches.map(userLabel).join(", ")
}
