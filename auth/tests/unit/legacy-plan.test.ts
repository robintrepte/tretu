import { describe, expect, it } from "vitest"
import { isPlaceholderEmail } from "@/lib/oidc/claims"
import { buildReport, planImport, type Anchor, type LegacyRecord } from "@/lib/legacy/plan"

let seq = 0
function rec(partial: Partial<LegacyRecord> & Pick<LegacyRecord, "app">): LegacyRecord {
  seq += 1
  return {
    legacyUserId: String(seq),
    username: null,
    name: null,
    email: null,
    emailVerified: false,
    image: null,
    createdAt: new Date(Date.UTC(2024, 0, seq)),
    passwordHash: null,
    identities: [],
    steamId: null,
    roles: [],
    ...partial,
  }
}

const discord = (id: string) => ({ provider: "discord" as const, id })
const google = (id: string) => ({ provider: "google" as const, id })
const groupOf = (plan: ReturnType<typeof planImport>, r: LegacyRecord) => plan.groups.find((g) => g.records.includes(r))!

describe("legacy matching rules", () => {
  it("merges accounts with the same Discord ID", () => {
    const tretu = rec({ app: "tretu-web", name: "Robin", identities: [discord("111")] })
    const nakama = rec({ app: "hollowmere", username: "robin_hm", identities: [discord("111")] })
    const plan = planImport([tretu, nakama], [])
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]!.reasons).toEqual(["discord"])
  })

  it("merges accounts with the same Google or Apple ID", () => {
    const a = rec({ app: "saga", username: "anna", identities: [google("g-1")] })
    const b = rec({ app: "play", username: "anna_p", identities: [google("g-1")] })
    const c = rec({ app: "hollowmere", username: "anna_h", identities: [{ provider: "apple", id: "ap-1" }] })
    const d = rec({ app: "saga", username: "anna2", identities: [{ provider: "apple", id: "ap-1" }] })
    const plan = planImport([a, b, c, d], [])
    expect(plan.groups).toHaveLength(2)
    expect(groupOf(plan, a)).toBe(groupOf(plan, b))
    expect(groupOf(plan, c)).toBe(groupOf(plan, d))
  })

  it("merges on email only when it is verified on both sides", () => {
    const play = rec({ app: "play", username: "max", email: "max@example.test", emailVerified: true })
    const saga = rec({ app: "saga", username: "maxi", email: "max@example.test", emailVerified: true })
    const nakama = rec({ app: "hollowmere", username: "maxh", email: "max@example.test", emailVerified: false })
    const plan = planImport([play, saga, nakama], [])
    expect(groupOf(plan, play)).toBe(groupOf(plan, saga))
    expect(groupOf(plan, play).reasons).toEqual(["verified-email"])
    // The unverified Hollowmere account stays separate, and cannot take the email (placeholder instead).
    const hm = groupOf(plan, nakama)
    expect(hm).not.toBe(groupOf(plan, play))
    expect(isPlaceholderEmail(hm.email)).toBe(true)
    expect(plan.conflicts.some((c) => c.kind === "email")).toBe(true)
  })

  it("never merges on username or display name alone", () => {
    const a = rec({ app: "saga", username: "sameName", name: "Same" })
    const b = rec({ app: "play", username: "sameName", name: "Same" })
    const plan = planImport([a, b], [])
    expect(plan.groups).toHaveLength(2)
  })

  it("is transitive (Discord on one side, verified email on the other)", () => {
    const a = rec({ app: "tretu-web", identities: [discord("222")] })
    const b = rec({ app: "saga", username: "bridge", identities: [discord("222")], email: "b@example.test", emailVerified: true })
    const c = rec({ app: "play", username: "bridge_p", email: "b@example.test", emailVerified: true })
    const plan = planImport([a, b, c], [])
    expect(plan.groups).toHaveLength(1)
    expect(new Set(plan.groups[0]!.reasons)).toEqual(new Set(["discord", "verified-email"]))
  })

  it("lets the older account keep the username; the newer one gets a suggestion and a free rename", () => {
    const older = rec({ app: "saga", username: "Robin", createdAt: new Date("2023-01-01") })
    const newer = rec({ app: "play", username: "robin", createdAt: new Date("2025-01-01") })
    const plan = planImport([newer, older], [])
    expect(groupOf(plan, older)).toMatchObject({ username: "Robin", usernamePending: false })
    expect(groupOf(plan, newer)).toMatchObject({ username: "robin_2", usernamePending: true })
    expect(plan.conflicts).toContainEqual(expect.objectContaining({ kind: "username", detail: "robin → robin_2" }))
  })

  it("respects names of existing Tretu accounts and reserved names", () => {
    const anchor: Anchor = { userId: "u-1", email: "x@example.test", emailVerified: true, username: "taken", identities: [], legacy: [], hasPassword: true, steamLinked: false }
    const a = rec({ app: "saga", username: "taken" })
    const b = rec({ app: "play", username: "admin" })
    const plan = planImport([a, b], [anchor])
    expect(groupOf(plan, a).username).toBe("taken_2")
    expect(groupOf(plan, b).username).toBe("spieler_admin")
  })

  it("joins existing Tretu accounts and keeps their password", () => {
    const anchor: Anchor = {
      userId: "existing",
      email: "e@example.test",
      emailVerified: true,
      username: "existing",
      identities: [discord("333")],
      legacy: [],
      hasPassword: true,
      steamLinked: false,
    }
    const r = rec({ app: "hollowmere", username: "hm", identities: [discord("333")], passwordHash: "bcrypt:x", steamId: "7656" })
    const plan = planImport([r], [anchor])
    expect(plan.groups[0]).toMatchObject({ anchorUserId: "existing", newUserId: null, passwordHash: null, steamId: "7656" })
  })

  it("is idempotent: records linked by an earlier run are not imported again", () => {
    const r = rec({ app: "saga", username: "again" })
    const anchor: Anchor = { userId: "imported", email: "a@x.test", emailVerified: false, username: "again", identities: [], legacy: [{ app: "saga", legacyUserId: r.legacyUserId }], hasPassword: true, steamLinked: false }
    const plan = planImport([r], [anchor])
    expect(plan.groups[0]).toMatchObject({ anchorUserId: "imported", newRecords: [] })
  })

  it("skips groups that would join two existing Tretu accounts", () => {
    const a: Anchor = { userId: "a", email: "a@x.test", emailVerified: true, username: "a", identities: [discord("1")], legacy: [], hasPassword: false, steamLinked: false }
    const b: Anchor = { userId: "b", email: "b@x.test", emailVerified: true, username: "b", identities: [], legacy: [], hasPassword: false, steamLinked: false }
    const r = rec({ app: "saga", identities: [discord("1")], email: "b@x.test", emailVerified: true })
    const plan = planImport([r], [a, b])
    expect(plan.groups).toHaveLength(0)
    expect(plan.skipped).toHaveLength(1)
    expect(plan.conflicts[0]!.kind).toBe("multiple-existing-accounts")
  })

  it("combines passwords (native first) and reports merges", () => {
    const native = `${"a".repeat(32)}:${"b".repeat(128)}`
    const a = rec({ app: "saga", username: "pw", passwordHash: "bcrypt:$2b$10$abcdefghijklmnopqrstuuvwxyzabcdefghijklmnopqrstuvwxyz1", identities: [discord("9")] })
    const b = rec({ app: "play", username: "pw2", passwordHash: native, identities: [discord("9")] })
    const plan = planImport([a, b], [])
    const group = plan.groups[0]!
    expect(group.passwordHash!.startsWith("multi:")).toBe(true)
    const list = JSON.parse(Buffer.from(group.passwordHash!.slice(6), "base64url").toString()) as string[]
    expect(list[0]).toBe(native)
    const report = buildReport(plan, { saga: { read: 1, skipped: 0 }, play: { read: 1, skipped: 0 } }, true, [a, b])
    expect(report.totals).toMatchObject({ records: 2, groups: 1, newUsers: 1, mergedGroups: 1 })
    expect(report.merges[0]!.reasons).toEqual(["discord"])
  })

  it("produces stable Tretu IDs for dry runs", () => {
    const r = rec({ app: "saga", username: "stable" })
    expect(planImport([r], []).groups[0]!.newUserId).toBe(planImport([r], []).groups[0]!.newUserId)
  })
})
