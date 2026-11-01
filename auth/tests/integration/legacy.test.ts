import { existsSync, readFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import bcrypt from "bcryptjs"
import { and, eq } from "drizzle-orm"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDb } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { claimWithPassword } from "@/lib/legacy/claim"
import { runImport } from "@/lib/legacy/run"
import { hashPassword, isNativeHash } from "@/lib/passwords"
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL } from "./env"
import { Jar, linkIn, registerVerifiedUser, request, waitForMail } from "./helpers"

/** Throwaway copies of the four old databases with fixture data (only the columns the import reads). */
const base = new URL(ADMIN_DATABASE_URL)
const urlFor = (name: string) => {
  const url = new URL(base)
  url.pathname = `/${name}`
  return url.toString()
}
const LEGACY = {
  saga: "tretu_auth_test_legacy_saga",
  play: "tretu_auth_test_legacy_play",
  tretu: "tretu_auth_test_legacy_tretu",
  nakama: "tretu_auth_test_legacy_nakama",
}
const sources = { saga: urlFor(LEGACY.saga), play: urlFor(LEGACY.play), tretu: urlFor(LEGACY.tretu), nakama: urlFor(LEGACY.nakama) }
const { client, db } = createDb(TEST_DATABASE_URL, 3)
let reportDir = ""

async function recreate(name: string, schemaSql: string) {
  const admin = postgres(ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} })
  await admin.unsafe(`drop database if exists "${name}" with (force)`)
  await admin.unsafe(`create database "${name}"`)
  await admin.end()
  const sql = postgres(urlFor(name), { max: 1, onnotice: () => {} })
  await sql.unsafe(schemaSql)
  return sql
}

beforeAll(async () => {
  reportDir = await mkdtemp(path.join(tmpdir(), "tretu-import-"))
  const sagaPw = await bcrypt.hash("saga-pass-123", 10)
  const nakamaPw = await bcrypt.hash("nakama-pass-123", 10)
  const maxPw = await bcrypt.hash("max-saga-pass", 10)

  const saga = await recreate(
    LEGACY.saga,
    `create table "User" (id serial primary key, username text unique not null, name text, email text unique not null, "emailVerified" timestamp, image text, password text, role text default 'player', "createdAt" timestamp default now());
     create table "Account" (id serial primary key, "userId" int not null, type text not null default 'oauth', provider text not null, "providerAccountId" text not null);`,
  )
  await saga`insert into "User" (id, username, name, email, password, role, "createdAt") values
    (1, 'Robin', 'Robin', 'robin@old.test', ${sagaPw}, 'admin', '2023-06-01'),
    (2, 'anna_saga', 'Anna', 'anna@old.test', null, 'player', '2023-07-01'),
    (3, 'max', 'Max', 'max@saga.test', ${maxPw}, 'player', '2023-02-01')`
  await saga`insert into "Account" ("userId", provider, "providerAccountId") values (1, 'discord', '1001'), (2, 'google', 'g-anna')`
  await saga.end()

  const play = await recreate(
    LEGACY.play,
    `create table "user" (id text primary key, name text not null, email text not null unique, email_verified boolean not null default false, image text, username text not null, role text not null default 'player', is_anonymous boolean not null default false, created_at timestamptz not null default now());
     create table account (id text primary key, account_id text not null, provider_id text not null, user_id text not null, password text);`,
  )
  const annaPw = await hashPassword("play-pass-123")
  const lenaPw = await hashPassword("lena-old-pass")
  await play`insert into "user" (id, name, email, email_verified, username, is_anonymous, created_at) values
    ('p-anna', 'Anna P', 'anna@old.test', true, 'anna', false, '2024-01-01'),
    ('p-max', 'Max P', 'max@play.test', false, 'max', false, '2025-01-01'),
    ('p-guest', 'Lucky Otter', 'guest@anon.test', false, 'lucky_otter', true, '2025-02-01'),
    ('p-lena', 'Lena', 'lena@old.test', true, 'lena', false, '2024-05-01')`
  await play`insert into account (id, account_id, provider_id, user_id, password) values
    ('a1', 'p-anna', 'credential', 'p-anna', ${annaPw}),
    ('a2', 'p-lena', 'credential', 'p-lena', ${lenaPw}),
    ('a3', 'p-max', 'credential', 'p-max', ${await hashPassword("max-play-pass")})`
  await play.end()

  const tretu = await recreate(
    LEGACY.tretu,
    `create table users (id serial primary key, discord_id text not null unique, display_name text not null, avatar_url text, created_at integer not null, updated_at integer);
     create table roles (id serial primary key, key text not null unique);
     create table user_roles (user_id int not null, role_id int not null);`,
  )
  await tretu`insert into users (id, discord_id, display_name, avatar_url, created_at) values (1, '1001', 'Robin T.', 'https://cdn.discordapp.com/avatars/1001/a.png', 1672531200), (2, '2002', 'Discord Only', null, 1680000000)`
  await tretu`insert into roles (id, key) values (1, 'admin')`
  await tretu`insert into user_roles (user_id, role_id) values (1, 1)`
  await tretu.end()

  const nakama = await recreate(
    LEGACY.nakama,
    `create table users (id uuid primary key, username varchar(128) not null unique, display_name varchar(255), avatar_url varchar(512), email varchar(255) unique, password bytea, custom_id varchar(128) unique, google_id varchar(128), apple_id varchar(128), steam_id varchar(128), create_time timestamptz not null default now());`,
  )
  await nakama`insert into users (id, username, create_time) values ('00000000-0000-0000-0000-000000000000', '', '2022-01-01')`
  await nakama`insert into users (id, username, display_name, email, password, custom_id, steam_id, create_time) values
    ('11111111-1111-4111-8111-111111111111', 'robin_hm', 'Robin', 'robin@old.test', ${Buffer.from(nakamaPw)}, 'discord:1001', '76561198000000001', '2024-03-01'),
    ('22222222-2222-4222-8222-222222222222', 'emailonly', 'Email Only', 'max@saga.test', ${Buffer.from(await bcrypt.hash("x-pass-123", 10))}, null, null, '2024-04-01')`
  await nakama.end()
})

afterAll(async () => {
  await client.end()
  const admin = postgres(ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} })
  for (const name of Object.values(LEGACY)) await admin.unsafe(`drop database if exists "${name}" with (force)`)
  await admin.end()
})

const linkFor = (app: string, legacyUserId: string) =>
  db.query.legacyLink.findFirst({ where: and(eq(s.legacyLink.app, app as "saga"), eq(s.legacyLink.legacyUserId, legacyUserId)) })

describe("legacy import", () => {
  it("dry run reports merges and conflicts without writing anything", async () => {
    const before = (await db.select({ id: s.user.id }).from(s.user)).length
    const { report, reportPath } = await runImport(db, sources, { dryRun: true, reportDir })
    expect((await db.select({ id: s.user.id }).from(s.user)).length).toBe(before)
    expect(existsSync(reportPath!)).toBe(true)
    expect(JSON.parse(readFileSync(reportPath!, "utf8")).dryRun).toBe(true)

    expect(report.sources).toEqual({
      saga: { read: 3, skipped: 0 },
      play: { read: 4, skipped: 1 },
      "tretu-web": { read: 2, skipped: 0 },
      hollowmere: { read: 3, skipped: 1 },
    })
    expect(report.totals.records).toBe(10)
    // robin: tretu + saga + nakama (Discord 1001); anna: play + saga (verified email).
    expect(report.totals.mergedGroups).toBe(2)
    expect(report.totals.newUsers).toBe(7)
    const robin = report.merges.find((m) => m.records.includes("tretu-web:1"))!
    expect(robin.records.sort()).toEqual(["hollowmere:11111111-1111-4111-8111-111111111111", "saga:1", "tretu-web:1"])
    expect(robin.reasons).toEqual(["discord"])
    const anna = report.merges.find((m) => m.records.includes("play:p-anna"))!
    expect(anna.records.sort()).toEqual(["play:p-anna", "saga:2"])
    expect(anna.reasons).toEqual(["verified-email"])
    // The newer "max" (Play) yields its name to the older Saga account; the unverified Nakama email is not taken over.
    expect(report.conflicts).toContainEqual(expect.objectContaining({ kind: "username", detail: "max → max_2", records: ["play:p-max"] }))
    expect(report.conflicts.filter((c) => c.kind === "email").map((c) => c.records)).toEqual([["hollowmere:22222222-2222-4222-8222-222222222222"]])
    expect(report.legacyRoles.map((r) => r.record).sort()).toEqual(["saga:1", "tretu-web:1"])
  })

  it("imports, links and is idempotent", async () => {
    const first = await runImport(db, sources, { dryRun: false, reportDir })
    expect(first.written).toEqual({ created: 7, joined: 0 })

    const robinLink = await linkFor("tretu-web", "1")
    const robin = await db.query.user.findFirst({ where: eq(s.user.id, robinLink!.userId) })
    expect(robin).toMatchObject({ username: "robin_t", displayUsername: "Robin_T", email: "robin@old.test", emailVerified: false })
    expect(robin!.createdAt.toISOString()).toBe("2023-01-01T00:00:00.000Z")
    expect((await linkFor("saga", "1"))!.userId).toBe(robin!.id)
    expect((await linkFor("hollowmere", "11111111-1111-4111-8111-111111111111"))!.userId).toBe(robin!.id)
    const accounts = await db.select().from(s.account).where(eq(s.account.userId, robin!.id))
    expect(accounts.map((a) => `${a.providerId}:${a.providerId === "credential" ? "-" : a.accountId}`).sort()).toEqual(["credential:-", "discord:1001"])
    expect(accounts.find((a) => a.providerId === "credential")!.password!.startsWith("multi:")).toBe(true)
    const steam = await db.query.externalLink.findFirst({ where: eq(s.externalLink.userId, robin!.id) })
    expect(steam).toMatchObject({ provider: "steam", providerAccountId: "76561198000000001" })

    const maxPlay = await db.query.user.findFirst({ where: eq(s.user.id, (await linkFor("play", "p-max"))!.userId) })
    expect(maxPlay).toMatchObject({ username: "max_2", usernamePending: true })
    const discordOnly = await db.query.user.findFirst({ where: eq(s.user.id, (await linkFor("tretu-web", "2"))!.userId) })
    expect(discordOnly!.email).toMatch(/@users\.tretu\.invalid$/)

    const second = await runImport(db, sources, { dryRun: false, reportDir })
    expect(second.written).toEqual({ created: 0, joined: 0 })
    const outbox = await db.select().from(s.eventOutbox).where(eq(s.eventOutbox.type, "user.created"))
    expect(outbox.filter((e) => e.sub === robin!.id)).toHaveLength(1)
  })

  it("signs in with an old Saga password, asks to verify the email first, then re-hashes", async () => {
    const jar = new Jar()
    const denied = await request(jar, "/api/auth/sign-in/username", { method: "POST", json: { username: "Robin_T", password: "saga-pass-123" } })
    expect(denied.status).toBe(403)
    expect(((await denied.json()) as { code: string }).code).toBe("EMAIL_NOT_VERIFIED")
    await request(jar, linkIn(await waitForMail("robin@old.test", /E-Mail/)))

    const ok = await request(new Jar(), "/api/auth/sign-in/username", { method: "POST", json: { username: "robin_t", password: "saga-pass-123" } })
    expect(ok.status).toBe(200)
    const robinId = (await linkFor("saga", "1"))!.userId
    const credential = await db.query.account.findFirst({ where: and(eq(s.account.userId, robinId), eq(s.account.providerId, "credential")) })
    expect(isNativeHash(credential!.password!)).toBe(true)
    const again = await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json: { email: "robin@old.test", password: "saga-pass-123" } })
    expect(again.status).toBe(200)
  })

  it("signs in with an imported Play hash as-is (verified email)", async () => {
    const res = await request(new Jar(), "/api/auth/sign-in/email", { method: "POST", json: { email: "anna@old.test", password: "play-pass-123" } })
    expect(res.status).toBe(200)
  })

  it("lets a signed-in user claim a not-merged old account with its password", async () => {
    const me = await registerVerifiedUser("lena")
    const lenaLink = (await linkFor("play", "p-lena"))!
    const wrong = await claimWithPassword(db, { userId: me.id, app: "play", identifier: "lena@old.test", password: "nope", claimDays: 90 })
    expect(wrong).toEqual({ ok: false, error: "notFound" })
    const ok = await claimWithPassword(db, { userId: me.id, app: "play", identifier: "LENA@old.test", password: "lena-old-pass", claimDays: 90 })
    expect(ok).toEqual({ ok: true, app: "play", legacyName: "lena" })
    expect((await linkFor("play", "p-lena"))!.userId).toBe(me.id)
    expect(await db.query.user.findFirst({ where: eq(s.user.id, lenaLink.userId) })).toBeUndefined()
    const deleted = await db.select().from(s.eventOutbox).where(and(eq(s.eventOutbox.type, "user.deleted"), eq(s.eventOutbox.sub, lenaLink.userId)))
    expect(deleted[0]!.envelope).toMatchObject({ app: "auth", sub: lenaLink.userId, data: { mergedInto: me.id } })
    expect(await claimWithPassword(db, { userId: me.id, app: "play", identifier: "lena", password: "lena-old-pass", claimDays: 90 })).toEqual({ ok: false, error: "alreadyYours" })
  })

  it("refuses accounts that were already used with an app, and after the claim window", async () => {
    const me = await registerVerifiedUser("claimer")
    const maxSaga = (await linkFor("saga", "3"))!
    await db.insert(s.oauthConsent).values({ id: crypto.randomUUID(), clientId: "saga", userId: maxSaga.userId, scopes: ["openid"], createdAt: new Date(), updatedAt: new Date() })
    expect(await claimWithPassword(db, { userId: me.id, app: "saga", identifier: "max", password: "max-saga-pass", claimDays: 90 })).toEqual({ ok: false, error: "inUse" })
    const maxPlay = (await linkFor("play", "p-max"))!
    await db.update(s.legacyLink).set({ importedAt: new Date(Date.now() - 91 * 86_400_000) }).where(eq(s.legacyLink.id, maxPlay.id))
    expect(await claimWithPassword(db, { userId: me.id, app: "play", identifier: "max@play.test", password: "max-play-pass", claimDays: 90 })).toEqual({ ok: false, error: "expired" })
  })
})
