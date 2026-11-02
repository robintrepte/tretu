import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { and, eq, inArray } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"
import { createDb } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { listLegacyAccounts } from "@/lib/legacy/admin"
import { TEST_DATABASE_URL } from "./env"
import { uniqueUser } from "./helpers"

/** `npm run admin -- merge | legacy`, run as the real CLI against the integration database. */
const root = path.resolve(import.meta.dirname, "../..")
const { client, db } = createDb(TEST_DATABASE_URL, 2)

afterAll(async () => {
  await client.end()
})

function admin(...args: string[]) {
  const result = spawnSync("npx", ["tsx", "scripts/admin.ts", ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    encoding: "utf8",
    timeout: 60_000,
  })
  return { code: result.status, out: result.stdout, err: result.stderr }
}

async function makeUser(prefix: string, extra: Partial<typeof s.user.$inferInsert> = {}) {
  const u = uniqueUser(prefix)
  const id = randomUUID()
  const username = u.username.toLowerCase()
  await db.insert(s.user).values({ id, name: u.name, email: u.email, emailVerified: true, username, displayUsername: username, ...extra })
  return { id, username, email: u.email }
}

const addAccount = (userId: string, providerId: string, accountId = randomUUID()) =>
  db.insert(s.account).values({ id: randomUUID(), userId, providerId, accountId, password: providerId === "credential" ? "scrypt-placeholder" : null })
const addGame = (userId: string, provider: "minecraft" | "teamspeak", name: string) =>
  db.insert(s.externalLink).values({ userId, provider, providerAccountId: randomUUID(), displayName: name })
const addPasskey = (userId: string, name: string) =>
  db.insert(s.passkey).values({ id: randomUUID(), name, userId, publicKey: "pk", credentialID: randomUUID(), counter: 0, deviceType: "singleDevice", backedUp: false, createdAt: new Date() })
const addLegacy = (userId: string, app: "saga" | "play", legacyUsername: string, legacyEmail: string | null = null) =>
  db.insert(s.legacyLink).values({ app, legacyUserId: randomUUID(), userId, legacyUsername, legacyEmail, method: "import" })

/** Everything the merge can touch, for "nothing changed" checks. */
async function snapshot(ids: string[]) {
  return {
    // Without updatedAt: the refusal test toggles a role on the source itself.
    users: (await db.select().from(s.user).where(inArray(s.user.id, ids)).orderBy(s.user.id)).map(({ updatedAt: _, ...u }) => u),
    accounts: await db.select({ id: s.account.id, userId: s.account.userId }).from(s.account).where(inArray(s.account.userId, ids)).orderBy(s.account.id),
    games: await db.select({ id: s.externalLink.id, userId: s.externalLink.userId }).from(s.externalLink).where(inArray(s.externalLink.userId, ids)).orderBy(s.externalLink.id),
    passkeys: await db.select({ id: s.passkey.id, userId: s.passkey.userId }).from(s.passkey).where(inArray(s.passkey.userId, ids)).orderBy(s.passkey.id),
    legacy: await db.select().from(s.legacyLink).where(inArray(s.legacyLink.userId, ids)).orderBy(s.legacyLink.id),
    outbox: await db.select({ id: s.eventOutbox.id }).from(s.eventOutbox).where(inArray(s.eventOutbox.sub, ids)),
    audit: await db.select({ id: s.auditLog.id }).from(s.auditLog).where(inArray(s.auditLog.userId, ids)),
  }
}

/** An old account with a bit of everything, and the account it belongs to (which already has a password and TeamSpeak). */
async function pair() {
  const from = await makeUser("admfrom")
  const into = await makeUser("adminto")
  await addAccount(from.id, "credential", from.id)
  await addAccount(from.id, "discord")
  await addGame(from.id, "minecraft", "Steve")
  await addGame(from.id, "teamspeak", "Old TS")
  await addPasskey(from.id, "Old laptop")
  await addLegacy(from.id, "saga", "oldname", "old@saga.test")
  await addAccount(into.id, "credential", into.id)
  await addAccount(into.id, "google")
  await addGame(into.id, "teamspeak", "New TS")
  return { from, into }
}

describe("npm run admin -- merge", () => {
  it("prints a dry run of both accounts and the plan, and changes nothing", async () => {
    const { from, into } = await pair()
    const before = await snapshot([from.id, into.id])
    const { code, out } = admin("merge", from.username, into.email)
    expect(code).toBe(0)
    expect(out).toContain("DRY RUN, nothing changed")
    expect(out).toContain(`FROM ${from.username} (${from.id})`)
    expect(out).toContain(`INTO ${into.username} (${into.id})`)
    expect(out).toContain("saga: oldname <old@saga.test>")
    const moves = out.slice(out.indexOf("Moves to"), out.indexOf("Dropped"))
    expect(moves).toMatch(/sign-in {4}discord /)
    expect(moves).toContain("minecraft")
    expect(moves).toContain("Old laptop")
    expect(moves).not.toContain("teamspeak")
    const dropped = out.slice(out.indexOf("Dropped"), out.indexOf("Deleted with"))
    expect(dropped).toContain("sign-in    password")
    expect(dropped).toContain("teamspeak")
    expect(out).toContain("Run again with --yes to merge.")
    expect(await snapshot([from.id, into.id])).toEqual(before)
  })

  it("merges with --yes: moves sign-ins, game links, passkeys and old-app links, deletes the source, emits both events and audits", async () => {
    const { from, into } = await pair()
    const { code, out } = admin("merge", from.email, into.username, "--yes")
    expect(code).toBe(0)
    expect(out).toContain(`Merged ${from.username} into ${into.username}`)

    expect(await db.query.user.findFirst({ where: eq(s.user.id, from.id) })).toBeUndefined()
    const accounts = await db.select().from(s.account).where(eq(s.account.userId, into.id))
    expect(accounts.map((a) => a.providerId).sort()).toEqual(["credential", "discord", "google"])
    expect(accounts.find((a) => a.providerId === "credential")!.accountId).toBe(into.id)
    const games = await db.select().from(s.externalLink).where(eq(s.externalLink.userId, into.id))
    expect(games.map((g) => `${g.provider}:${g.displayName}`).sort()).toEqual(["minecraft:Steve", "teamspeak:New TS"])
    expect((await db.select().from(s.passkey).where(eq(s.passkey.userId, into.id))).map((p) => p.name)).toEqual(["Old laptop"])
    const legacy = await db.select().from(s.legacyLink).where(eq(s.legacyLink.userId, into.id))
    expect(legacy).toEqual([expect.objectContaining({ app: "saga", legacyUsername: "oldname", method: "admin", claimedAt: expect.any(Date) })])
    // Nothing of the source is left behind.
    for (const table of [s.account, s.externalLink, s.passkey, s.legacyLink]) {
      expect(await db.select().from(table).where(eq(table.userId, from.id))).toEqual([])
    }

    const updated = await db.select().from(s.eventOutbox).where(and(eq(s.eventOutbox.type, "user.updated"), eq(s.eventOutbox.sub, into.id)))
    expect(updated).toHaveLength(1)
    expect(updated[0]!.envelope).toMatchObject({ app: "auth", sub: into.id, data: { sub: into.id, username: into.username } })
    const deleted = await db.select().from(s.eventOutbox).where(and(eq(s.eventOutbox.type, "user.deleted"), eq(s.eventOutbox.sub, from.id)))
    expect(deleted).toHaveLength(1)
    expect(deleted[0]!.envelope).toMatchObject({ app: "auth", sub: from.id, data: { mergedInto: into.id } })

    const entries = await db.select().from(s.auditLog).where(and(eq(s.auditLog.userId, into.id), eq(s.auditLog.event, "admin.merge")))
    expect(entries).toHaveLength(1)
    expect(entries[0]!.meta).toMatchObject({
      by: "cli",
      from: from.id,
      fromUsername: from.username,
      moved: { providers: ["discord"], gameLinks: ["minecraft"], passkeys: 1, legacy: [expect.stringMatching(/^saga:/)] },
      dropped: { providers: ["credential"], gameLinks: ["teamspeak"] },
    })
  })

  it("refuses the same account, unknown accounts (with close matches) and an admin as the source", async () => {
    const { from, into } = await pair()
    const before = await snapshot([from.id, into.id])

    const same = admin("merge", from.username, from.email.toUpperCase(), "--yes")
    expect(same.code).toBe(1)
    expect(same.err).toContain("same account")

    const typo = admin("merge", `${from.username}x`, into.username, "--yes")
    expect(typo.code).toBe(1)
    expect(typo.err).toContain(`no user ${from.username}x (did you mean: ${from.username} <${from.email}>`)
    const unknownInto = admin("merge", from.username, "nobody-like-this-at-all@nowhere.test", "--yes")
    expect(unknownInto.code).toBe(1)
    expect(unknownInto.err).toContain("no user nobody-like-this-at-all@nowhere.test")

    await db.update(s.user).set({ roles: ["admin"] }).where(eq(s.user.id, from.id))
    const adminFrom = admin("merge", from.username, into.username, "--yes")
    expect(adminFrom.code).toBe(1)
    expect(adminFrom.err).toContain("admin role")

    expect(admin("merge", from.username).code).toBe(1)
    await db.update(s.user).set({ roles: [] }).where(eq(s.user.id, from.id))
    expect(await snapshot([from.id, into.id])).toEqual(before)
  })
})

describe("npm run admin -- legacy", () => {
  it("lists imported accounts no merge touched yet, with possible matches", async () => {
    const tag = randomUUID().slice(0, 8)
    const imported = await makeUser("admold", { emailVerified: false })
    await addLegacy(imported.id, "play", `oldie_${tag}`, `oldie.${tag}@old.test`)
    const current = await makeUser("admnew", { email: `oldie.${tag}@old.test` })
    const merged = await makeUser("admdone")
    await db.insert(s.legacyLink).values({ app: "saga", legacyUserId: randomUUID(), userId: merged.id, legacyUsername: "done", method: "admin" })

    const listed = await listLegacyAccounts(db)
    const entry = listed.find((c) => c.account.id === imported.id)!
    expect(entry.account.legacy).toEqual([expect.objectContaining({ app: "play", legacyUsername: `oldie_${tag}`, legacyEmail: `oldie.${tag}@old.test` })])
    expect(entry.possibleMatches).toEqual([{ id: current.id, username: current.username, email: `oldie.${tag}@old.test`, reasons: ["email"] }])
    expect(listed.map((c) => c.account.id)).not.toContain(current.id)
    expect(listed.map((c) => c.account.id)).not.toContain(merged.id)

    const { code, out } = admin("legacy")
    expect(code).toBe(0)
    expect(out).toContain(`${imported.username} (${imported.id})`)
    expect(out).toContain(`play: oldie_${tag} <oldie.${tag}@old.test>`)
    expect(out).toContain(`maybe      ${current.username} <oldie.${tag}@old.test> [email]`)
    expect(out).toContain("npm run admin -- merge <from> <into>")
  })
})
