import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { and, desc, eq, inArray } from "drizzle-orm"
import * as oidc from "openid-client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { liftExpiredLocks } from "@/lib/admin/lock"
import { createDb } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { signRequest } from "@/lib/tretu/signing"
import { APP_SECRETS, ISSUER, SAGA_SECRET, TEST_DATABASE_URL } from "./env"
import {
  discover,
  enableTwoFactor,
  finishSocial,
  Jar,
  linkIn,
  locationOf,
  loginPageQuery,
  mockProviderCode,
  registerVerifiedUser,
  request,
  SAGA_REDIRECT,
  sessionOf,
  startAuthorization,
  startSocial,
  steamSignIn,
  uniqueUser,
  waitForMail,
} from "./helpers"

/**
 * The admin API for tretu.de's central admin (/api/v1/admin/**) and the account lock, against the real app:
 * signature, caller and actor checks, the guards, activity log entries for target and admin, events in the outbox,
 * the lock for every sign-in method, the search across every identifier and the stats.
 */

const root = path.resolve(import.meta.dirname, "../..")
const { client, db } = createDb(TEST_DATABASE_URL, 2)
afterAll(async () => {
  await client.end()
})

/* ───────────── helpers ───────────── */

type Json = Record<string, unknown>

async function api(method: "GET" | "POST", pathWithQuery: string, body?: unknown, options: { app?: keyof typeof APP_SECRETS; secret?: string; raw?: string } = {}) {
  const app = options.app ?? "tretu-web"
  const raw = options.raw ?? (body === undefined ? "" : JSON.stringify(body))
  const headers = signRequest({ appId: app, secret: options.secret ?? APP_SECRETS[app], method, pathWithQuery, body: raw })
  const res = await fetch(`${ISSUER}${pathWithQuery}`, { method, headers: { ...headers, ...(raw && { "content-type": "application/json" }) }, body: raw || undefined })
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Json & { error?: string } }
}

let n = 0
const tag = () => `${Date.now().toString(36)}${++n}`
const numericId = () => `${Date.now()}${String(++n).padStart(4, "0")}`
const steamId = () => String(76561198700000000n + BigInt((Date.now() % 1_000_000) * 10 + (++n % 10)))

async function makeUser(prefix: string, extra: Partial<typeof s.user.$inferInsert> = {}) {
  const u = uniqueUser(prefix)
  const id = randomUUID()
  const username = u.username.toLowerCase()
  await db.insert(s.user).values({ id, name: u.name, email: u.email, emailVerified: true, username, displayUsername: u.username, ...extra })
  return { id, username, displayUsername: u.username, email: u.email, name: u.name }
}
const makeAdmin = (prefix = "admin", extra: Partial<typeof s.user.$inferInsert> = {}) => makeUser(prefix, { roles: ["admin"], twoFactorEnabled: true, ...extra })
const addAccount = (userId: string, providerId: string, accountId: string = randomUUID(), displayName: string | null = null) =>
  db.insert(s.account).values({ id: randomUUID(), userId, providerId, accountId, displayName, password: providerId === "credential" ? "scrypt-placeholder" : null })
const addGame = (userId: string, provider: "minecraft" | "teamspeak", providerAccountId: string, displayName: string | null) =>
  db.insert(s.externalLink).values({ userId, provider, providerAccountId, displayName })

const outbox = (sub: string, type: string) =>
  db.select().from(s.eventOutbox).where(and(eq(s.eventOutbox.sub, sub), eq(s.eventOutbox.type, type))).orderBy(desc(s.eventOutbox.createdAt))
const auditOf = (userId: string, event: string) =>
  db.select().from(s.auditLog).where(and(eq(s.auditLog.userId, userId), eq(s.auditLog.event, event))).orderBy(desc(s.auditLog.createdAt))
const userRow = async (id: string) => (await db.query.user.findFirst({ where: eq(s.user.id, id) }))!

const USER_ROUTES = ["roles", "sessions/revoke", "lock", "unlock", "two-factor/reset", "links/remove", "email/verify"] as const
const validBody = (route: (typeof USER_ROUTES)[number], actorSub: string): Json => ({
  actorSub,
  reason: "Support-Fall #1",
  ...(route === "roles" && { add: ["tester"] }),
  ...(route === "links/remove" && { provider: "minecraft" }),
})

/** An app sign-in (Saga) for a signed-in browser: the tokens and the client configuration. */
async function appTokens(jar: Jar) {
  const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
  const flow = startAuthorization(config, SAGA_REDIRECT)
  const res = await request(jar, await flow.url())
  const callback = locationOf(res)
  expect(callback.origin + callback.pathname).toBe(SAGA_REDIRECT)
  const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
  return { config, tokens }
}

let actor: Awaited<ReturnType<typeof makeAdmin>>
beforeAll(async () => {
  actor = await makeAdmin("actor")
})

/* ───────────── signature, caller, actor ───────────── */

describe("admin API: who may call it", () => {
  it("answers 401 without or with a wrong signature and 403 for every app but tretu-web", async () => {
    for (const route of ["/api/v1/admin/users", "/api/v1/admin/stats", "/api/v1/admin/legacy", `/api/v1/admin/users/${actor.id}`]) {
      const bare = await fetch(`${ISSUER}${route}`)
      expect(bare.status, route).toBe(401)
      expect(await bare.json()).toEqual({ error: "unauthorized" })
      expect((await api("GET", route, undefined, { secret: "wrong-secret-wrong-secret-wrong" })).status, route).toBe(401)
      const saga = await api("GET", route, undefined, { app: "saga" })
      expect(saga.status, route).toBe(403)
      expect(saga.body.error).toBe("forbidden_app")
      expect((await api("GET", route)).status, route).toBe(200)
    }
    const target = await makeUser("sig")
    for (const route of USER_ROUTES) {
      const url = `/api/v1/admin/users/${target.id}/${route}`
      const body = validBody(route, actor.id)
      expect((await api("POST", url, body, { secret: "wrong-secret-wrong-secret-wrong" })).status, route).toBe(401)
      expect((await api("POST", url, body, { app: "auth" })).status, route).toBe(403)
      expect((await api("POST", url, body, { app: "saga" })).body.error, route).toBe("forbidden_app")
    }
    // A body that differs from the signed one is refused (the signature covers the exact bytes).
    const headers = signRequest({ appId: "tretu-web", secret: APP_SECRETS["tretu-web"], method: "POST", pathWithQuery: `/api/v1/admin/users/${target.id}/lock`, body: "{}" })
    const tampered = await fetch(`${ISSUER}/api/v1/admin/users/${target.id}/lock`, { method: "POST", headers: { ...headers }, body: JSON.stringify(validBody("lock", actor.id)) })
    expect(tampered.status).toBe(401)
    expect((await userRow(target.id)).locked).toBe(false)
  })

  it("needs an actor who holds admin now, is not locked and has two-factor sign-in", async () => {
    const target = await makeUser("act")
    const plain = await makeUser("notadmin")
    const noTwoFactor = await makeAdmin("adm2fa", { twoFactorEnabled: false })
    const lockedAdmin = await makeAdmin("admlck", { locked: true })
    const expiredLockAdmin = await makeAdmin("admexp", { locked: true, lockedUntil: new Date(Date.now() - 60_000) })
    for (const route of USER_ROUTES) {
      const url = `/api/v1/admin/users/${target.id}/${route}`
      for (const [who, error] of [
        [plain.id, "actor_not_admin"],
        [randomUUID(), "actor_not_admin"],
        [lockedAdmin.id, "actor_not_admin"],
        [noTwoFactor.id, "actor_two_factor_required"],
      ] as const) {
        const res = await api("POST", url, validBody(route, who))
        expect(res.status, `${route} ${error}`).toBe(403)
        expect(res.body.error, route).toBe(error)
      }
    }
    // A lock that ran out no longer counts.
    expect((await api("POST", `/api/v1/admin/users/${target.id}/email/verify`, validBody("email/verify", expiredLockAdmin.id))).status).toBe(200)
    // Reads take an optional actor, checked the same way.
    expect((await api("GET", `/api/v1/admin/users?actorSub=${plain.id}`)).body.error).toBe("actor_not_admin")
    expect((await api("GET", `/api/v1/admin/users?actorSub=${actor.id}&q=${target.username}`)).status).toBe(200)
    // Nothing was changed or recorded for the refused requests.
    expect(await auditOf(target.id, "admin.roles_changed")).toEqual([])
    expect((await userRow(target.id)).locked).toBe(false)
  })

  it("validates bodies (reason required, 3+ characters) and answers 404 for unknown accounts", async () => {
    const target = await makeUser("val")
    for (const route of USER_ROUTES) {
      const url = `/api/v1/admin/users/${target.id}/${route}`
      const body = validBody(route, actor.id)
      expect((await api("POST", url, { ...body, reason: undefined })).status, route).toBe(400)
      const short = await api("POST", url, { ...body, reason: " ab " })
      expect(short.status, route).toBe(400)
      expect(short.body.error).toBe("invalid_request")
      expect((await api("POST", url, undefined, { raw: "{not json" })).status, route).toBe(400)
      const unknown = await api("POST", `/api/v1/admin/users/${randomUUID()}/${route}`, body)
      expect(unknown.status, route).toBe(404)
      expect(unknown.body.error).toBe("not_found")
    }
    expect((await api("GET", `/api/v1/admin/users/${randomUUID()}`)).status).toBe(404)
    expect((await api("POST", `/api/v1/admin/users/${target.id}/roles`, { actorSub: actor.id, reason: "keine Rollen" })).status).toBe(400)
    expect((await api("POST", `/api/v1/admin/users/${target.id}/roles`, { actorSub: actor.id, reason: "ungültig", add: ["Not A Role"] })).status).toBe(400)
    expect((await api("POST", `/api/v1/admin/users/${target.id}/links/remove`, { actorSub: actor.id, reason: "Test", provider: "credential" })).status).toBe(400)
    expect((await api("POST", `/api/v1/admin/users/${target.id}/lock`, { actorSub: actor.id, reason: "Test", until: new Date(Date.now() - 1000).toISOString() })).status).toBe(400)
    expect((await api("POST", `/api/v1/admin/merge`, { actorSub: actor.id, reason: "Test", from: target.id, into: actor.id })).status).toBe(400)
    expect((await api("GET", "/api/v1/admin/users?limit=500")).status).toBe(400)
    expect((await api("GET", "/api/v1/admin/users?cursor=bm9wZQ")).status).toBe(400)
  })
})

/* ───────────── roles ───────────── */

describe("POST /users/{sub}/roles", () => {
  it("adds and removes roles, records both sides and emits user.updated", async () => {
    const target = await makeUser("roles")
    const res = await api("POST", `/api/v1/admin/users/${target.id}/roles`, { actorSub: actor.id, reason: "Neuer Moderator", add: ["moderator", "admin"] })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, changed: true, user: { sub: target.id, roles: ["moderator", "admin"] } })
    expect((await userRow(target.id)).roles).toEqual(["moderator", "admin"])

    const [targetEntry] = await auditOf(target.id, "admin.roles_changed")
    expect(targetEntry!.meta).toMatchObject({ by: "api", actorSub: actor.id, actorUsername: actor.displayUsername, reason: "Neuer Moderator", added: ["moderator", "admin"], removed: [] })
    const [actorEntry] = await auditOf(actor.id, "admin.performed")
    expect(actorEntry!.meta).toMatchObject({ action: "roles_changed", targetSub: target.id, targetUsername: target.displayUsername, reason: "Neuer Moderator" })
    const [event] = await outbox(target.id, "user.updated")
    expect(event!.envelope).toMatchObject({ app: "auth", type: "user.updated", sub: target.id, data: { sub: target.id, roles: ["moderator", "admin"], locked: false } })

    const again = await api("POST", `/api/v1/admin/users/${target.id}/roles`, { actorSub: actor.id, reason: "nochmal", add: ["moderator"] })
    expect(again.body).toMatchObject({ ok: true, changed: false })
    expect(await auditOf(target.id, "admin.roles_changed")).toHaveLength(1)

    const removed = await api("POST", `/api/v1/admin/users/${target.id}/roles`, { actorSub: actor.id, reason: "Nicht mehr nötig", remove: ["admin"] })
    expect(removed.body).toMatchObject({ changed: true, user: { roles: ["moderator"] } })
    expect(await outbox(target.id, "user.updated")).toHaveLength(2)
  })

  it("refuses removing your own admin role (403) and leaves the roles alone", async () => {
    const self = await api("POST", `/api/v1/admin/users/${actor.id}/roles`, { actorSub: actor.id, reason: "Ich höre auf", remove: ["admin"] })
    expect(self.status).toBe(403)
    expect(self.body.error).toBe("self_action")
    expect((await userRow(actor.id)).roles).toEqual(["admin"])
    // Adding a role to yourself is fine.
    expect((await api("POST", `/api/v1/admin/users/${actor.id}/roles`, { actorSub: actor.id, reason: "Beta", add: ["beta"] })).body.changed).toBe(true)
    expect((await api("POST", `/api/v1/admin/users/${actor.id}/roles`, { actorSub: actor.id, reason: "Beta aus", remove: ["beta"] })).body.changed).toBe(true)
  })
})

/* ───────────── the last admin (CLI: the API actor is always another admin) ───────────── */

describe("the last admin", () => {
  function cli(...args: string[]) {
    const result = spawnSync("npx", ["tsx", "scripts/admin.ts", ...args], { cwd: root, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, encoding: "utf8", timeout: 60_000 })
    return { code: result.status, out: result.stdout, err: result.stderr }
  }

  it("is never demoted or locked; npm run admin uses the same rules and records the reason", async () => {
    const last = await makeAdmin("lastadm")
    // Every other admin is locked for this test (restored afterwards), so `last` is the only usable one.
    const others = (await db.select({ id: s.user.id, roles: s.user.roles, locked: s.user.locked, lockedUntil: s.user.lockedUntil }).from(s.user)).filter(
      (u) => u.roles.includes("admin") && u.id !== last.id,
    )
    await db.update(s.user).set({ locked: true, lockedUntil: null }).where(inArray(s.user.id, others.map((o) => o.id)))
    try {
      const revoke = cli("revoke", last.username, "admin")
      expect(revoke.code).toBe(1)
      expect(revoke.err).toContain("last admin")
      const lock = cli("lock", last.username)
      expect(lock.code).toBe(1)
      expect(lock.err).toContain("last admin")
      expect(await userRow(last.id)).toMatchObject({ roles: ["admin"], locked: false })
    } finally {
      for (const o of others) await db.update(s.user).set({ locked: o.locked, lockedUntil: o.lockedUntil }).where(eq(s.user.id, o.id))
    }

    // With another admin around, the CLI changes roles and locks, recorded with `by: "cli"` and the reason.
    expect(cli("grant", last.username, "moderator", "--reason=Hilft im Discord").code).toBe(0)
    const [entry] = await auditOf(last.id, "admin.roles_changed")
    expect(entry!.meta).toMatchObject({ by: "cli", reason: "Hilft im Discord", added: ["moderator"] })
    const until = new Date(Date.now() + 86_400_000).toISOString()
    const locked = cli("lock", last.username, `--until=${until}`)
    expect(locked.code, locked.err).toBe(0)
    expect(await userRow(last.id)).toMatchObject({ locked: true, lockedReason: "CLI", lockedUntil: new Date(until) })
    expect(cli("unlock", last.username).out).toContain("unlocked")
    expect(cli("revoke", last.username, "admin").code).toBe(0)
    expect((await userRow(last.id)).roles).toEqual(["moderator"])
  })
})

/* ───────────── sessions, 2FA, email, links ───────────── */

describe("POST /users/{sub}/sessions/revoke", () => {
  it("ends every session and app token", async () => {
    const user = await registerVerifiedUser("revoke")
    const { config, tokens } = await appTokens(user.jar)
    const res = await api("POST", `/api/v1/admin/users/${user.id}/sessions/revoke`, { actorSub: actor.id, reason: "Konto kompromittiert" })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, changed: true, revoked: { sessions: 1 } })
    expect((res.body.revoked as { tokens: number }).tokens).toBeGreaterThanOrEqual(2)
    expect(await sessionOf(user.jar)).toBeNull()
    await expect(oidc.refreshTokenGrant(config, tokens.refresh_token!)).rejects.toThrow()
    const [entry] = await auditOf(user.id, "admin.sessions_revoked")
    expect(entry!.meta).toMatchObject({ actorSub: actor.id, reason: "Konto kompromittiert", sessions: 1 })
    expect((await api("POST", `/api/v1/admin/users/${user.id}/sessions/revoke`, { actorSub: actor.id, reason: "nochmal" })).body.changed).toBe(false)
  })
})

describe("POST /users/{sub}/two-factor/reset", () => {
  it("removes TOTP and backup codes and signs out everywhere", async () => {
    const user = await registerVerifiedUser("tfreset")
    await enableTwoFactor(user.jar, user.password)
    expect((await userRow(user.id)).twoFactorEnabled).toBe(true)
    const res = await api("POST", `/api/v1/admin/users/${user.id}/two-factor/reset`, { actorSub: actor.id, reason: "Handy verloren" })
    expect(res.body).toMatchObject({ ok: true, changed: true, user: { twoFactor: false } })
    expect(await db.select().from(s.twoFactor).where(eq(s.twoFactor.userId, user.id))).toEqual([])
    expect(await sessionOf(user.jar)).toBeNull()
    expect(await auditOf(user.id, "admin.two_factor_reset")).toHaveLength(1)
    // Signs in with the password alone again.
    const signIn = await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password } })
    expect(signIn.status).toBe(200)
    expect((await api("POST", `/api/v1/admin/users/${user.id}/two-factor/reset`, { actorSub: actor.id, reason: "nochmal" })).body.changed).toBe(false)
  })
})

describe("POST /users/{sub}/email/verify", () => {
  it("confirms the address; refuses accounts without one", async () => {
    const target = await makeUser("mail", { emailVerified: false })
    const res = await api("POST", `/api/v1/admin/users/${target.id}/email/verify`, { actorSub: actor.id, reason: "Ticket 42" })
    expect(res.body).toMatchObject({ changed: true })
    expect((await userRow(target.id)).emailVerified).toBe(true)
    expect((await auditOf(target.id, "admin.email_verified"))[0]!.meta).toMatchObject({ reason: "Ticket 42", email: target.email })
    expect((await api("POST", `/api/v1/admin/users/${target.id}/email/verify`, { actorSub: actor.id, reason: "Ticket 42" })).body.changed).toBe(false)

    const steamOnly = await makeUser("noemail", { email: `u-${randomUUID()}@users.tretu.invalid`, emailVerified: false })
    const refused = await api("POST", `/api/v1/admin/users/${steamOnly.id}/email/verify`, { actorSub: actor.id, reason: "Ticket 43" })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toBe("no_email")
  })
})

describe("POST /users/{sub}/links/remove", () => {
  it("removes sign-in identities and game links, never the last way to sign in", async () => {
    const target = await makeUser("links")
    const discordId = numericId()
    const mcUuid = randomUUID()
    await addAccount(target.id, "credential", target.id)
    await addAccount(target.id, "discord", discordId)
    await addGame(target.id, "minecraft", mcUuid, "Steve")

    const discord = await api("POST", `/api/v1/admin/users/${target.id}/links/remove`, { actorSub: actor.id, reason: "Falsches Discord-Konto", provider: "discord" })
    expect(discord.body).toMatchObject({ changed: true, user: { links: { minecraft: mcUuid, minecraftName: "Steve" } } })
    expect((discord.body.user as { links: Json }).links.discord).toBeUndefined()
    const [event] = await outbox(target.id, "user.updated")
    expect((event!.envelope as { data: { links: Json } }).data.links).toEqual({ minecraft: mcUuid, minecraftName: "Steve" })
    expect((await auditOf(target.id, "admin.link_removed"))[0]!.meta).toMatchObject({ provider: "discord", accountId: discordId, actorSub: actor.id })

    const minecraft = await api("POST", `/api/v1/admin/users/${target.id}/links/remove`, { actorSub: actor.id, reason: "Account verkauft", provider: "minecraft" })
    expect(minecraft.body.changed).toBe(true)
    expect(await outbox(target.id, "user.updated")).toHaveLength(2)
    expect((await api("POST", `/api/v1/admin/users/${target.id}/links/remove`, { actorSub: actor.id, reason: "nochmal", provider: "minecraft" })).body.changed).toBe(false)

    // A Steam-only account keeps Steam; with a passkey it may go.
    const steamOnly = await makeUser("steamonly")
    await addAccount(steamOnly.id, "steam", steamId())
    const refused = await api("POST", `/api/v1/admin/users/${steamOnly.id}/links/remove`, { actorSub: actor.id, reason: "Test", provider: "steam" })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toBe("last_sign_in_method")
    await db.insert(s.passkey).values({ id: randomUUID(), userId: steamOnly.id, publicKey: "pk", credentialID: randomUUID(), counter: 0, deviceType: "singleDevice", backedUp: false, createdAt: new Date() })
    expect((await api("POST", `/api/v1/admin/users/${steamOnly.id}/links/remove`, { actorSub: actor.id, reason: "Test", provider: "steam" })).body.changed).toBe(true)
  })
})

/* ───────────── merge and legacy ───────────── */

describe("POST /merge and GET /legacy", () => {
  it("answers a dry run without changes, merges with the actor recorded, refuses admins and unknown accounts", async () => {
    const from = await makeUser("mfrom")
    const into = await makeUser("minto")
    await addAccount(from.id, "discord", numericId())
    await db.insert(s.legacyLink).values({ app: "saga", legacyUserId: randomUUID(), userId: from.id, legacyUsername: `old_${tag()}`, method: "import" })

    const legacy = await api("GET", "/api/v1/admin/legacy")
    expect(legacy.status).toBe(200)
    const listed = (legacy.body.items as { account: { id: string; legacy: unknown[] } }[]).find((c) => c.account.id === from.id)
    expect(listed?.account.legacy).toHaveLength(1)

    const dry = await api("POST", "/api/v1/admin/merge", { actorSub: actor.id, reason: "Doppeltes Konto", from: from.id, into: into.id, dryRun: true })
    expect(dry.status).toBe(200)
    expect(dry.body).toMatchObject({ ok: true, dryRun: true, plan: { from: { id: from.id }, into: { id: into.id }, move: { providers: [{ providerId: "discord" }] } } })
    expect(await db.query.user.findFirst({ where: eq(s.user.id, from.id) })).toBeTruthy()
    expect(await auditOf(into.id, "admin.merge")).toEqual([])

    const merged = await api("POST", "/api/v1/admin/merge", { actorSub: actor.id, reason: "Doppeltes Konto", from: from.id, into: into.id, dryRun: false })
    expect(merged.body).toMatchObject({ ok: true, dryRun: false, merged: true, user: { sub: into.id } })
    expect(await db.query.user.findFirst({ where: eq(s.user.id, from.id) })).toBeUndefined()
    expect((await auditOf(into.id, "admin.merge"))[0]!.meta).toMatchObject({ by: "api", actorSub: actor.id, reason: "Doppeltes Konto", from: from.id })
    expect((await auditOf(actor.id, "admin.performed")).find((e) => e.meta?.action === "merge" && e.meta?.targetSub === into.id)).toBeTruthy()
    expect((await outbox(from.id, "user.deleted"))[0]!.envelope).toMatchObject({ data: { mergedInto: into.id } })
    expect(await outbox(into.id, "user.updated")).toHaveLength(1)

    const otherAdmin = await makeAdmin("madm")
    const refused = await api("POST", "/api/v1/admin/merge", { actorSub: actor.id, reason: "Test", from: otherAdmin.id, into: into.id, dryRun: true })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toBe("merge_refused")
    expect((await api("POST", "/api/v1/admin/merge", { actorSub: actor.id, reason: "Test", from: into.id, into: into.id, dryRun: true })).status).toBe(409)
    expect((await api("POST", "/api/v1/admin/merge", { actorSub: actor.id, reason: "Test", from: randomUUID(), into: into.id, dryRun: true })).status).toBe(404)
  })
})

/* ───────────── GET user ───────────── */

describe("GET /users/{sub}", () => {
  it("shows profile, sign-in methods, passkeys, sessions with their app, old-app links and the activity log", async () => {
    const user = await registerVerifiedUser("detail")
    await appTokens(user.jar)
    const discordId = numericId()
    await addAccount(user.id, "discord", discordId)
    const passkeyId = randomUUID()
    const lastUsed = new Date(Date.now() - 3_600_000)
    await db.insert(s.passkey).values({ id: passkeyId, name: "Laptop", userId: user.id, publicKey: "pk", credentialID: randomUUID(), counter: 0, deviceType: "singleDevice", backedUp: false, createdAt: new Date(), lastUsedAt: lastUsed })
    await db.insert(s.legacyLink).values({ app: "play", legacyUserId: "p-1", userId: user.id, legacyUsername: "oldplayer", method: "import" })

    const res = await api("GET", `/api/v1/admin/users/${user.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      sub: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      emailVerified: true,
      roles: [],
      twoFactor: false,
      locked: false,
      lockedReason: null,
      lockedUntil: null,
      links: { discord: discordId },
      passkeys: [{ id: passkeyId, name: "Laptop", lastUsedAt: lastUsed.toISOString() }],
      legacyLinks: [{ app: "play", legacyUserId: "p-1", legacyUsername: "oldplayer", method: "import" }],
    })
    const providers = res.body.providers as { provider: string; accountId: string | null }[]
    expect(providers.map((p) => p.provider).sort()).toEqual(["discord", "password"])
    expect(providers.find((p) => p.provider === "password")!.accountId).toBeNull()
    expect(res.body.sessions).toEqual([expect.objectContaining({ client: "saga", userAgent: expect.stringContaining("integration-test") })])
    const activity = res.body.audit as { event: string }[]
    expect(activity.map((a) => a.event)).toEqual(expect.arrayContaining(["register", "login"]))
    expect(typeof res.body.lastSignInAt).toBe("string")
  })
})

/* ───────────── lock ───────────── */

describe("lock and unlock", () => {
  it("locks: sessions, app tokens and pending codes end, user.updated { locked: true }, refused for yourself", async () => {
    const user = await registerVerifiedUser("lock")
    const { config, tokens } = await appTokens(user.jar)
    // An authorization code issued just before the lock cannot be exchanged afterwards.
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const pending = locationOf(await request(user.jar, await flow.url()))

    const until = new Date(Date.now() + 7 * 86_400_000)
    const res = await api("POST", `/api/v1/admin/users/${user.id}/lock`, { actorSub: actor.id, reason: "Spam im Chat", until: until.toISOString() })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, changed: true, lockedUntil: until.toISOString(), user: { sub: user.id, locked: true } })

    expect(await sessionOf(user.jar)).toBeNull()
    await expect(oidc.refreshTokenGrant(config, tokens.refresh_token!)).rejects.toThrow()
    await expect(oidc.authorizationCodeGrant(config, pending, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })).rejects.toThrow()
    expect(await userRow(user.id)).toMatchObject({ locked: true, lockedReason: "Spam im Chat", lockedUntil: until, lockedAt: expect.any(Date) })

    const [event] = await outbox(user.id, "user.updated")
    expect(event!.envelope).toMatchObject({ data: { sub: user.id, locked: true } })
    const shape = await api("GET", `/api/v1/users/${user.id}`, undefined, { app: "saga" })
    expect(shape.body).toMatchObject({ sub: user.id, locked: true })
    const detail = await api("GET", `/api/v1/admin/users/${user.id}`)
    expect(detail.body).toMatchObject({ locked: true, lockedReason: "Spam im Chat", lockedUntil: until.toISOString() })
    expect((await auditOf(user.id, "admin.locked"))[0]!.meta).toMatchObject({ actorSub: actor.id, reason: "Spam im Chat", until: until.toISOString() })
    expect((await auditOf(actor.id, "admin.performed")).find((e) => e.meta?.action === "locked" && e.meta?.targetSub === user.id)).toBeTruthy()

    // The same lock again changes nothing; a new end date updates it without a second event.
    expect((await api("POST", `/api/v1/admin/users/${user.id}/lock`, { actorSub: actor.id, reason: "Spam im Chat", until: until.toISOString() })).body.changed).toBe(false)
    expect((await api("POST", `/api/v1/admin/users/${user.id}/lock`, { actorSub: actor.id, reason: "Spam im Chat", until: null })).body).toMatchObject({ changed: true, user: { locked: true } })
    expect(await outbox(user.id, "user.updated")).toHaveLength(1)
    expect((await userRow(user.id)).lockedUntil).toBeNull()

    const self = await api("POST", `/api/v1/admin/users/${actor.id}/lock`, { actorSub: actor.id, reason: "Urlaub" })
    expect(self.status).toBe(403)
    expect(self.body.error).toBe("self_action")
    expect((await userRow(actor.id)).locked).toBe(false)

    // Unlock: user.updated { locked: false }, sign-in works again.
    const unlock = await api("POST", `/api/v1/admin/users/${user.id}/unlock`, { actorSub: actor.id, reason: "Einspruch angenommen" })
    expect(unlock.body).toMatchObject({ changed: true, user: { locked: false } })
    expect(await userRow(user.id)).toMatchObject({ locked: false, lockedReason: null, lockedUntil: null, lockedAt: null })
    expect((await outbox(user.id, "user.updated"))[0]!.envelope).toMatchObject({ data: { locked: false } })
    expect((await auditOf(user.id, "admin.unlocked"))[0]!.meta).toMatchObject({ reason: "Einspruch angenommen" })
    expect((await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password } })).status).toBe(200)
    expect((await api("POST", `/api/v1/admin/users/${user.id}/unlock`, { actorSub: actor.id, reason: "nochmal" })).body.changed).toBe(false)
  })

  async function lock(sub: string, until?: Date) {
    const res = await api("POST", `/api/v1/admin/users/${sub}/lock`, { actorSub: actor.id, reason: "Test-Sperre", ...(until && { until: until.toISOString() }) })
    expect(res.status).toBe(200)
  }
  const lockedRedirect = (res: Response) => {
    expect(res.status).toBe(302)
    const target = locationOf(res)
    expect(target.pathname).toBe("/login")
    expect(target.searchParams.get("error")).toBe("ACCOUNT_LOCKED")
    return target
  }
  async function refusedAudit(userId: string, method: string) {
    const entries = await auditOf(userId, "login.failed")
    expect(entries.some((e) => e.meta?.code === "ACCOUNT_LOCKED" && e.meta?.method === method), `login.failed ${method}`).toBe(true)
  }

  it("refuses password sign-in with a friendly code and the end of the lock", async () => {
    const user = await registerVerifiedUser("lockpw")
    const until = new Date(Date.now() + 3 * 86_400_000)
    await lock(user.id, until)
    for (const json of [{ email: user.email, password: user.password }]) {
      const res = await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json })
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ code: "ACCOUNT_LOCKED", lockedUntil: until.toISOString() })
    }
    const byName = await request(new Jar(), "/api/auth/sign-in/username", { method: "POST", json: { username: user.username, password: user.password } })
    expect(byName.status).toBe(403)
    // A wrong password does not reveal the lock.
    const wrong = await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: "wrong password 123456" } })
    expect(wrong.status).toBe(401)
    await refusedAudit(user.id, "password")
    // The login page shows the message for the redirect flows.
    const page = await (await request(new Jar(), `/login?error=ACCOUNT_LOCKED&until=${encodeURIComponent(until.toISOString())}`)).text()
    expect(page).toContain("Dein Tretu-Konto ist bis")
    expect(await (await request(new Jar(), "/login?error=ACCOUNT_LOCKED")).text()).toContain("Dein Tretu-Konto ist gesperrt.")
  })

  it("refuses magic links and email confirmation links (back to the login page with the message)", async () => {
    const user = await registerVerifiedUser("lockml")
    await lock(user.id)
    const since = Date.now()
    const jar = new Jar()
    expect((await request(jar, "/api/auth/sign-in/magic-link", { method: "POST", json: { email: user.email, callbackURL: "/konto" } })).status).toBe(200)
    lockedRedirect(await request(jar, linkIn(await waitForMail(user.email, /Anmeldelink/, 10_000, since))))
    expect(await sessionOf(jar)).toBeNull()
    await refusedAudit(user.id, "magic-link")

    // Not yet confirmed when locked: the confirmation link confirms, but signs nobody in.
    const fresh = uniqueUser("lockve")
    const signUp = await request(new Jar(), "/api/auth/sign-up/email", { method: "POST", json: { ...fresh, callbackURL: "/konto" } })
    expect(signUp.status).toBe(200)
    const created = await db.query.user.findFirst({ where: eq(s.user.email, fresh.email) })
    await lock(created!.id)
    const browser = new Jar()
    const target = lockedRedirect(await request(browser, linkIn(await waitForMail(fresh.email))))
    expect(target.searchParams.get("until")).toBeNull()
    expect(await sessionOf(browser)).toBeNull()
    await refusedAudit(created!.id, "email-link")
  })

  it("refuses Discord, Google, Apple and Steam sign-ins", async () => {
    const user = await registerVerifiedUser("lockprov")
    const ids = { discord: numericId(), google: `g-${tag()}`, apple: `001.${tag()}.apple`, steam: steamId() }
    for (const [provider, accountId] of Object.entries(ids)) await addAccount(user.id, provider, accountId)
    const until = new Date(Date.now() + 86_400_000)
    await lock(user.id, until)
    const profiles = {
      discord: { id: ids.discord, username: "lock_dc", email: user.email, verified: true },
      google: { sub: ids.google, email: user.email, email_verified: true, name: "Lock", given_name: "Lock" },
      apple: { sub: ids.apple, email: user.email, email_verified: "true" },
    }
    for (const provider of ["discord", "google", "apple"] as const) {
      const jar = new Jar()
      const { state } = await startSocial(jar, provider)
      const code = `lock-${provider}-${tag()}`
      await mockProviderCode(provider, code, profiles[provider])
      const target = lockedRedirect(await finishSocial(jar, provider, state, code))
      expect(target.searchParams.get("until"), provider).toBe(until.toISOString())
      expect(await sessionOf(jar), provider).toBeNull()
      await refusedAudit(user.id, provider)
    }
    const jar = new Jar()
    lockedRedirect(await steamSignIn(jar, ids.steam))
    expect(await sessionOf(jar)).toBeNull()
    await refusedAudit(user.id, "steam")
    expect(await db.select().from(s.session).where(eq(s.session.userId, user.id))).toEqual([])
  })

  it("refuses the second factor of a two-factor sign-in that was locked in between", async () => {
    const user = await registerVerifiedUser("lock2fa")
    const device = await enableTwoFactor(user.jar, user.password)
    const browser = new Jar()
    const first = await request(browser, "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password } })
    expect(((await first.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true)
    await lock(user.id)
    const verify = await request(browser, "/api/auth/two-factor/verify-totp", { method: "POST", json: { code: await device.code() } })
    expect(verify.status).toBeGreaterThanOrEqual(400)
    expect(await sessionOf(browser)).toBeNull()
    // And a fresh attempt is refused right after the password.
    const again = await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password } })
    expect(again.status).toBe(403)
  })

  it("refuses an OIDC authorization (and continue) for a session that survived a lock", async () => {
    const user = await registerVerifiedUser("locksess")
    // A lock written without the API (e.g. a race): the session still exists.
    await db.update(s.user).set({ locked: true, lockedReason: "race" }).where(eq(s.user.id, user.id))
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    lockedRedirect(await request(user.jar, await flow.url()))
    expect(await db.select().from(s.session).where(eq(s.session.userId, user.id))).toEqual([])
    await refusedAudit(user.id, "session")

    // Pages treat a locked account as signed out, and the continue endpoint answers JSON.
    const second = await registerVerifiedUser("lockcont")
    const oauthQuery = await loginPageQuery(new Jar(), await startAuthorization(config, SAGA_REDIRECT).url())
    await db.update(s.user).set({ locked: true }).where(eq(s.user.id, second.id))
    expect(locationOf(await request(second.jar, "/konto")).pathname).toBe("/login")
    const cont = await request(second.jar, "/api/auth/oauth2/continue", { method: "POST", json: { created: true, oauth_query: oauthQuery } })
    expect(cont.status).toBe(403)
    expect(await cont.json()).toMatchObject({ code: "ACCOUNT_LOCKED" })
    expect(await db.select().from(s.session).where(eq(s.session.userId, second.id))).toEqual([])
  })

  it("ends by itself at lockedUntil: the next sign-in lifts it, and the worker sweep does the same", async () => {
    const user = await registerVerifiedUser("lockexp")
    await lock(user.id, new Date(Date.now() + 60_000))
    await db.update(s.user).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(s.user.id, user.id))
    // Already shown as unlocked before anything lifted it.
    expect((await api("GET", `/api/v1/users/${user.id}`, undefined, { app: "saga" })).body.locked).toBe(false)
    const signIn = await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password } })
    expect(signIn.status).toBe(200)
    expect(await userRow(user.id)).toMatchObject({ locked: false, lockedUntil: null, lockedReason: null })
    expect(await auditOf(user.id, "lock.expired")).toHaveLength(1)
    expect((await outbox(user.id, "user.updated"))[0]!.envelope).toMatchObject({ data: { locked: false } })

    const other = await makeUser("lockswp", { locked: true, lockedReason: "x", lockedUntil: new Date(Date.now() - 1000) })
    const stillLocked = await makeUser("lockkeep", { locked: true, lockedUntil: new Date(Date.now() + 60_000) })
    const lifted = await liftExpiredLocks(db)
    expect(lifted).toContain(other.id)
    expect(lifted).not.toContain(stillLocked.id)
    expect((await userRow(other.id)).locked).toBe(false)
    expect((await outbox(other.id, "user.updated"))[0]!.envelope).toMatchObject({ data: { locked: false } })
    expect(await liftExpiredLocks(db, other.id)).toEqual([])
  })
})

/* ───────────── search ───────────── */

describe("GET /users (search)", () => {
  const search = async (q: string, extra = "") => api("GET", `/api/v1/admin/users?q=${encodeURIComponent(q)}${extra}`)
  const subsOf = (body: Json) => (body.items as { sub: string }[]).map((i) => i.sub)

  it("finds an account by username, name, email, sub, Discord ID, Steam ID, Minecraft UUID and name, TeamSpeak UID", async () => {
    const t = tag()
    const target = await makeUser("srch", { name: `Zora Quill ${t}`, email: `zq.${t}@search.test` })
    const ids = { discord: numericId(), steam: steamId(), minecraft: randomUUID(), mcName: `Mc_${t}`, teamspeak: `ts${t}AbC+/=` }
    await addAccount(target.id, "discord", ids.discord)
    await addAccount(target.id, "steam", ids.steam, "SteamPersona")
    await addGame(target.id, "minecraft", ids.minecraft, ids.mcName)
    await addGame(target.id, "teamspeak", ids.teamspeak, `TsNick${t}`)

    const queries = [
      target.username,
      target.username.slice(2, -2).toUpperCase(),
      `Quill ${t}`,
      `zq.${t}@SEARCH`,
      target.id,
      ids.discord,
      ids.steam,
      ids.minecraft,
      ids.minecraft.replace(/-/g, "").toUpperCase(),
      ids.mcName.toLowerCase(),
      ids.teamspeak,
    ]
    for (const q of queries) {
      const res = await search(q)
      expect(res.status, q).toBe(200)
      expect(subsOf(res.body), q).toContain(target.id)
    }
    const [item] = (await search(ids.steam)).body.items as Json[]
    expect(item).toEqual({
      sub: target.id,
      username: target.displayUsername,
      name: `Zora Quill ${t}`,
      email: `zq.${t}@search.test`,
      picture: null,
      createdAt: expect.any(String),
      lastSignInAt: null,
      roles: [],
      twoFactor: false,
      locked: false,
      links: { discord: ids.discord, steam: ids.steam, minecraft: ids.minecraft, minecraftName: ids.mcName, teamspeak: ids.teamspeak, teamspeakName: `TsNick${t}` },
    })
    expect(subsOf((await search(`nothing-like-${t}-at-all`)).body)).toEqual([])
    // LIKE wildcards in the query are literal.
    expect(subsOf((await search(`%${t}%`)).body)).toEqual([])
  })

  it("puts exact matches first and pages with a cursor (no duplicates, no gaps)", async () => {
    const t = tag()
    const exact = await makeUser("pg", { createdAt: new Date(Date.now() - 86_400_000) })
    // Five newer accounts that contain the exact one's username in their name.
    const others = []
    for (let i = 0; i < 5; i++) others.push(await makeUser("pg", { name: `Fan of ${exact.username} ${t} ${i}`, createdAt: new Date(Date.now() - i * 1000) }))
    const all = []
    let cursor: string | null = null
    let pages = 0
    do {
      const res = await search(exact.username, `&limit=2${cursor ? `&cursor=${cursor}` : ""}`)
      expect(res.status).toBe(200)
      all.push(...subsOf(res.body))
      cursor = res.body.nextCursor as string | null
      pages++
    } while (cursor && pages < 10)
    expect(pages).toBe(3)
    expect(all[0]).toBe(exact.id)
    expect(all.slice(1)).toEqual(others.map((o) => o.id))

    // Without q: every account, newest first, also with a cursor.
    const first = await api("GET", "/api/v1/admin/users?limit=3")
    const firstItems = first.body.items as { sub: string; createdAt: string }[]
    expect(firstItems).toHaveLength(3)
    const next = await api("GET", `/api/v1/admin/users?limit=3&cursor=${first.body.nextCursor}`)
    const nextItems = next.body.items as { sub: string; createdAt: string }[]
    expect(nextItems.map((i) => i.sub)).not.toContain(firstItems[0]!.sub)
    expect(Date.parse(nextItems[0]!.createdAt)).toBeLessThanOrEqual(Date.parse(firstItems[2]!.createdAt))
  })

  it("has the indexes the search relies on", async () => {
    const rows = await client<{ indexname: string }[]>`select indexname from pg_indexes where schemaname = 'public'`
    expect(rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining(["user_username_trgm_idx", "user_name_trgm_idx", "user_email_trgm_idx", "account_account_id_idx", "external_link_display_name_trgm_idx", "audit_log_event_created_idx"]),
    )
  })
})

/* ───────────── stats ───────────── */

describe("GET /stats", () => {
  const berlinDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
  const get = async () => (await api("GET", "/api/v1/admin/stats")).body as {
    users: { total: number; verified: number; withTwoFactor: number; locked: number; admins: number }
    signUpsPerDay: { day: string; count: number }[]
    signInsPerDay: { day: string; count: number }[]
    providers: { password: number; discord: number; google: number; apple: number; steam: number; passkey: number }
  }
  const countOn = (series: { day: string; count: number }[], day: string) => series.find((d) => d.day === day)?.count ?? -1

  it("counts accounts, sign-ups and sign-ins per Berlin day over 90 days, and sign-in methods", async () => {
    const before = await get()
    expect(before.signUpsPerDay).toHaveLength(90)
    expect(before.signInsPerDay).toHaveLength(90)
    expect(before.signUpsPerDay.at(-1)!.day).toBe(berlinDay(new Date()))
    expect(before.signUpsPerDay.map((d) => d.day)).toEqual([...before.signUpsPerDay.map((d) => d.day)].sort())
    expect(before.signInsPerDay.map((d) => d.day)).toEqual(before.signUpsPerDay.map((d) => d.day))

    // 00:30 in Berlin, ten days ago: still the previous day in UTC.
    const tenDays = new Date(Date.now() - 10 * 86_400_000)
    const day = berlinDay(tenDays)
    const offset = new Date(`${day}T12:00:00Z`).toLocaleString("en-US", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }) === "13" ? 1 : 2
    const lateNight = new Date(Date.parse(`${day}T00:30:00Z`) - offset * 3_600_000)
    expect(berlinDay(lateNight)).toBe(day)
    const a = await makeUser("st", { createdAt: lateNight, twoFactorEnabled: true, roles: ["admin"] })
    const b = await makeUser("st", { createdAt: lateNight, emailVerified: false, locked: true })
    await makeUser("st", { createdAt: new Date(Date.now() - 100 * 86_400_000), email: `u-${randomUUID()}@users.tretu.invalid` })
    await makeUser("st", { locked: true, lockedUntil: new Date(Date.now() - 1000) }) // ran out: not locked
    await addAccount(a.id, "credential", a.id)
    await addAccount(a.id, "steam", steamId())
    await addAccount(b.id, "discord", numericId())
    await db.insert(s.passkey).values({ id: randomUUID(), userId: b.id, publicKey: "pk", credentialID: randomUUID(), counter: 0, deviceType: "singleDevice", backedUp: false, createdAt: new Date() })
    // Sign-ins: `a` twice and `b` once on that day (two accounts), `a` once yesterday, a failure that does not count.
    const yesterday = berlinDay(new Date(Date.now() - 86_400_000))
    await db.insert(s.auditLog).values([
      { userId: a.id, event: "login", createdAt: lateNight },
      { userId: a.id, event: "login", createdAt: new Date(lateNight.getTime() + 3_600_000) },
      { userId: b.id, event: "login", createdAt: new Date(lateNight.getTime() + 7_200_000) },
      { userId: b.id, event: "login.failed", success: false, createdAt: lateNight },
      { userId: a.id, event: "login", createdAt: new Date(Date.now() - 86_400_000) },
    ])

    const after = await get()
    expect(after.users.total - before.users.total).toBe(4)
    expect(after.users.verified - before.users.verified).toBe(2) // b unconfirmed, placeholder address never counts
    expect(after.users.withTwoFactor - before.users.withTwoFactor).toBe(1)
    expect(after.users.admins - before.users.admins).toBe(1)
    expect(after.users.locked - before.users.locked).toBe(1)
    expect(countOn(after.signUpsPerDay, day) - countOn(before.signUpsPerDay, day)).toBe(2)
    expect(countOn(after.signInsPerDay, day) - countOn(before.signInsPerDay, day)).toBe(2)
    expect(countOn(after.signInsPerDay, yesterday) - countOn(before.signInsPerDay, yesterday)).toBe(1)
    expect(after.signUpsPerDay.reduce((sum, d) => sum + d.count, 0) - before.signUpsPerDay.reduce((sum, d) => sum + d.count, 0)).toBe(3)
    expect(after.providers.password - before.providers.password).toBe(1)
    expect(after.providers.steam - before.providers.steam).toBe(1)
    expect(after.providers.discord - before.providers.discord).toBe(1)
    expect(after.providers.passkey - before.providers.passkey).toBe(1)
    expect(Object.keys(after.providers).sort()).toEqual(["apple", "discord", "google", "passkey", "password", "steam"])
  })
})
