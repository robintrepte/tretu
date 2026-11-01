import { createHash } from "node:crypto"
import { placeholderEmail } from "@/lib/oidc/claims"
import { combineStored, isNativeHash } from "@/lib/passwords"
import { isValidUsername, normalizeUsername, RESERVED_USERNAMES, slugifyUsername, USERNAME_MAX } from "@/lib/usernames"

/**
 * The legacy import's matching rules (pure, unit-tested in tests/unit/legacy-plan.test.ts):
 * - same Discord ID → same person;
 * - same Google or Apple account ID → same person;
 * - same email, verified on both sides → same person;
 * - anything weaker (same unverified email, same username, same display name) is NOT merged.
 * Merging is transitive. Existing Tretu accounts (and accounts created by an earlier import run) take part
 * as anchors, so the import can be re-run without creating duplicates.
 */

export type LegacyApp = "saga" | "play" | "tretu-web" | "hollowmere"
export type IdentityProvider = "discord" | "google" | "apple"

export interface LegacyRecord {
  app: LegacyApp
  legacyUserId: string
  username: string | null
  name: string | null
  /** Lowercase. */
  email: string | null
  emailVerified: boolean
  image: string | null
  createdAt: Date
  /** In the stored format of lib/passwords.ts (`bcrypt:` or native), or null. */
  passwordHash: string | null
  identities: { provider: IdentityProvider; id: string }[]
  steamId: string | null
  /** Roles in the old app, only reported (global roles are granted by hand). */
  roles: string[]
}

export interface Anchor {
  userId: string
  email: string
  emailVerified: boolean
  username: string | null
  identities: { provider: IdentityProvider; id: string }[]
  /** Legacy accounts already linked to this user (earlier import runs, claims). */
  legacy: { app: LegacyApp; legacyUserId: string }[]
  hasPassword: boolean
  steamLinked: boolean
}

export type MergeReason = "discord" | "google" | "apple" | "verified-email" | "already-linked"

export interface PlannedGroup {
  /** Existing Tretu user the records join, or null for a new account. */
  anchorUserId: string | null
  /** For new accounts: the new Tretu ID. */
  newUserId: string | null
  records: LegacyRecord[]
  /** Records not linked yet (already linked ones are skipped by the writer). */
  newRecords: LegacyRecord[]
  reasons: MergeReason[]
  username: string
  usernamePending: boolean
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  passwordHash: string | null
  identities: { provider: IdentityProvider; id: string }[]
  steamId: string | null
}

export interface Conflict {
  kind: "username" | "email" | "multiple-existing-accounts" | "multiple-identities" | "same-app-merged" | "steam-taken"
  detail: string
  records: string[]
}

export interface ImportPlan {
  groups: PlannedGroup[]
  conflicts: Conflict[]
  skipped: { record: string; reason: string }[]
}

const recordKey = (r: Pick<LegacyRecord, "app" | "legacyUserId">) => `${r.app}:${r.legacyUserId}`

class UnionFind {
  private parent = new Map<string, string>()
  find(x: string): string {
    let root = x
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!
    let node = x
    while (node !== root) {
      const next = this.parent.get(node) ?? root
      this.parent.set(node, root)
      node = next
    }
    if (!this.parent.has(root)) this.parent.set(root, root)
    return root
  }
  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(rb, ra)
  }
}

/** The keys that make two accounts "the same person". */
export function matchKeys(entity: { email: string | null; emailVerified: boolean; identities: { provider: IdentityProvider; id: string }[] }): string[] {
  const keys = entity.identities.map((i) => `${i.provider}:${i.id}`)
  if (entity.email && entity.emailVerified) keys.push(`email:${entity.email.toLowerCase()}`)
  return keys
}

/** Deterministic new Tretu IDs: re-running a dry run shows the same IDs. */
function deterministicUuid(seed: string): string {
  const h = createHash("sha256").update(`tretu-legacy:${seed}`).digest()
  h[6] = (h[6]! & 0x0f) | 0x40
  h[8] = (h[8]! & 0x3f) | 0x80
  const hex = h.subarray(0, 16).toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function cleanUsername(record: LegacyRecord): string {
  const raw = (record.username ?? "").trim()
  if (isValidUsername(raw)) return raw
  return slugifyUsername(raw || record.name || record.email || "spieler")
}

/** Suggestion for a taken name: name_2, name_3, … (deterministic, so dry runs are stable). */
function suggest(base: string, taken: (lower: string) => boolean): string {
  for (let n = 2; n < 10_000; n++) {
    const suffix = `_${n}`
    const candidate = `${base.slice(0, USERNAME_MAX - suffix.length)}${suffix}`
    if (!taken(candidate.toLowerCase())) return candidate
  }
  throw new Error(`no free username for ${base}`)
}

export function planImport(records: LegacyRecord[], anchors: Anchor[], options: { takenUsernames?: Iterable<string>; takenEmails?: Iterable<string>; takenSteamIds?: Iterable<string> } = {}): ImportPlan {
  const uf = new UnionFind()
  const reasonsByKey = new Map<string, MergeReason>()
  const conflicts: Conflict[] = []

  const anchorNode = (a: Anchor) => `anchor:${a.userId}`
  for (const anchor of anchors) {
    uf.find(anchorNode(anchor))
    for (const key of matchKeys(anchor)) uf.union(anchorNode(anchor), `key:${key}`)
    for (const l of anchor.legacy) uf.union(anchorNode(anchor), `key:legacy:${recordKey(l)}`)
  }
  for (const record of records) {
    const node = `record:${recordKey(record)}`
    uf.find(node)
    uf.union(node, `key:legacy:${recordKey(record)}`)
    for (const key of matchKeys(record)) {
      uf.union(node, `key:${key}`)
      reasonsByKey.set(key, key.startsWith("email:") ? "verified-email" : (key.split(":")[0] as MergeReason))
    }
  }

  const groups = new Map<string, { anchors: Anchor[]; records: LegacyRecord[] }>()
  const groupOf = (root: string) => {
    let g = groups.get(root)
    if (!g) groups.set(root, (g = { anchors: [], records: [] }))
    return g
  }
  for (const anchor of anchors) groupOf(uf.find(anchorNode(anchor))).anchors.push(anchor)
  for (const record of records) groupOf(uf.find(`record:${recordKey(record)}`)).records.push(record)

  // Usernames and emails already in use by Tretu accounts outside this import.
  const usernames = new Set([...(options.takenUsernames ?? [])].map((u) => u.toLowerCase()))
  for (const a of anchors) if (a.username) usernames.add(a.username.toLowerCase())
  const emails = new Set([...(options.takenEmails ?? [])].map((e) => e.toLowerCase()))
  for (const a of anchors) emails.add(a.email.toLowerCase())
  const steamIds = new Set(options.takenSteamIds ?? [])

  const skipped: ImportPlan["skipped"] = []
  const planned: PlannedGroup[] = []
  // Older accounts first: they keep their names and emails.
  const ordered = [...groups.values()]
    .filter((g) => g.records.length > 0)
    .sort((a, b) => oldest(a.records).getTime() - oldest(b.records).getTime() || recordKey(a.records[0]!).localeCompare(recordKey(b.records[0]!)))

  for (const group of ordered) {
    const records = [...group.records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || recordKey(a).localeCompare(recordKey(b)))
    const ids = records.map(recordKey)
    if (group.anchors.length > 1) {
      conflicts.push({ kind: "multiple-existing-accounts", detail: `links ${group.anchors.map((a) => a.userId).join(" + ")}`, records: ids })
      for (const id of ids) skipped.push({ record: id, reason: "matches more than one existing Tretu account" })
      continue
    }
    const anchor = group.anchors[0] ?? null
    const linked = new Set(anchor?.legacy.map(recordKey) ?? [])
    const newRecords = records.filter((r) => !linked.has(recordKey(r)))

    const reasons = new Set<MergeReason>()
    if (records.length + (anchor ? 1 : 0) > 1) {
      const keyCount = new Map<string, number>()
      for (const entity of [...records, ...(anchor ? [anchor] : [])]) for (const key of matchKeys(entity)) keyCount.set(key, (keyCount.get(key) ?? 0) + 1)
      for (const [key, count] of keyCount) if (count > 1) reasons.add(reasonsByKey.get(key) ?? (key.startsWith("email:") ? "verified-email" : (key.split(":")[0] as MergeReason)))
      if (anchor && records.some((r) => linked.has(recordKey(r)))) reasons.add("already-linked")
    }
    const apps = records.map((r) => r.app)
    if (new Set(apps).size < apps.length) conflicts.push({ kind: "same-app-merged", detail: "several accounts of one app belong to one person", records: ids })

    const identities = uniqueIdentities([...records.flatMap((r) => r.identities), ...(anchor?.identities ?? [])])
    for (const provider of ["discord", "google", "apple"] as const) {
      if (identities.filter((i) => i.provider === provider).length > 1) conflicts.push({ kind: "multiple-identities", detail: `${provider}: ${identities.filter((i) => i.provider === provider).map((i) => i.id).join(", ")}`, records: ids })
    }

    const primary = records[0]!
    const steam = records.find((r) => r.steamId)?.steamId ?? null
    let steamId: string | null = null
    if (steam && !(anchor?.steamLinked ?? false)) {
      if (steamIds.has(steam)) conflicts.push({ kind: "steam-taken", detail: steam, records: ids })
      else {
        steamIds.add(steam)
        steamId = steam
      }
    }
    // Native (Play) hashes first, then the newest old password.
    const passwords = [...records]
      .filter((r) => r.passwordHash)
      .sort((a, b) => Number(isNativeHash(b.passwordHash!)) - Number(isNativeHash(a.passwordHash!)) || b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => r.passwordHash)

    if (anchor) {
      planned.push({
        anchorUserId: anchor.userId,
        newUserId: null,
        records,
        newRecords,
        reasons: [...reasons],
        username: anchor.username ?? "",
        usernamePending: false,
        name: "",
        email: anchor.email,
        emailVerified: anchor.emailVerified,
        image: null,
        createdAt: oldest(records),
        passwordHash: anchor.hasPassword ? null : combineStored(passwords),
        identities,
        steamId,
      })
      continue
    }

    // Username: the oldest account's name; if taken, a suggestion and a free rename on first login.
    const wanted = cleanUsername(primary)
    let username = wanted
    let usernamePending = false
    if (usernames.has(wanted.toLowerCase()) || RESERVED_USERNAMES.has(normalizeUsername(wanted))) {
      username = suggest(wanted, (lower) => usernames.has(lower) || RESERVED_USERNAMES.has(lower))
      usernamePending = true
      conflicts.push({ kind: "username", detail: `${wanted} → ${username}`, records: ids })
    }
    usernames.add(username.toLowerCase())

    // Email: a verified one first (oldest), else the oldest one; a taken email becomes a placeholder.
    const withEmail = records.filter((r) => r.email)
    const chosen = withEmail.find((r) => r.emailVerified) ?? withEmail[0] ?? null
    const newUserId = deterministicUuid(recordKey(primary))
    let email = placeholderEmail(newUserId)
    let emailVerified = false
    if (chosen?.email) {
      if (emails.has(chosen.email)) conflicts.push({ kind: "email", detail: `${chosen.email} is used by another account; placeholder used`, records: ids })
      else {
        email = chosen.email
        emailVerified = chosen.emailVerified
      }
    }
    emails.add(email)

    planned.push({
      anchorUserId: null,
      newUserId,
      records,
      newRecords,
      reasons: [...reasons],
      username,
      usernamePending,
      name: (primary.name?.trim() || records.find((r) => r.name?.trim())?.name?.trim() || username).slice(0, 64),
      email,
      emailVerified,
      image: records.find((r) => r.image)?.image ?? null,
      createdAt: oldest(records),
      passwordHash: combineStored(passwords),
      identities,
      steamId,
    })
  }
  return { groups: planned, conflicts, skipped }
}

function oldest(records: LegacyRecord[]): Date {
  return new Date(Math.min(...records.map((r) => r.createdAt.getTime())))
}

function uniqueIdentities(list: { provider: IdentityProvider; id: string }[]) {
  const seen = new Set<string>()
  return list.filter((i) => {
    const key = `${i.provider}:${i.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface ImportReport {
  generatedAt: string
  dryRun: boolean
  sources: Record<string, { read: number; skipped: number }>
  totals: { records: number; groups: number; newUsers: number; joinedExisting: number; mergedGroups: number; skipped: number }
  merges: { into: string; username: string; reasons: MergeReason[]; records: string[] }[]
  conflicts: Conflict[]
  skipped: { record: string; reason: string }[]
  legacyRoles: { record: string; roles: string[] }[]
}

export function buildReport(plan: ImportPlan, sources: ImportReport["sources"], dryRun: boolean, records: LegacyRecord[]): ImportReport {
  const merged = plan.groups.filter((g) => g.records.length + (g.anchorUserId ? 1 : 0) > 1)
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    sources,
    totals: {
      records: records.length,
      groups: plan.groups.length,
      newUsers: plan.groups.filter((g) => !g.anchorUserId).length,
      joinedExisting: plan.groups.filter((g) => g.anchorUserId && g.newRecords.length).length,
      mergedGroups: merged.length,
      skipped: plan.skipped.length,
    },
    merges: merged.map((g) => ({ into: g.anchorUserId ?? g.newUserId!, username: g.username, reasons: g.reasons, records: g.records.map(recordKey) })),
    conflicts: plan.conflicts,
    skipped: plan.skipped,
    legacyRoles: records.filter((r) => r.roles.some((role) => role !== "player" && role !== "user")).map((r) => ({ record: recordKey(r), roles: r.roles })),
  }
}
