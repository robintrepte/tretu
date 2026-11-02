import { randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { createRemoteJWKSet, jwtVerify } from "jose"
import * as oidc from "openid-client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDb } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { signRequest } from "@/lib/tretu/signing"
import { APP_SECRETS, ISSUER, SAGA_SECRET, TEST_DATABASE_URL } from "./env"
import { discover, registerVerifiedUser, request, SAGA_REDIRECT, startAuthorization, uniqueUser } from "./helpers"

/**
 * The `legacy_ids` claim (scope `tretu`) from `legacy_link`, end to end: ID token, userinfo, the user shape of
 * GET /api/v1/users/{sub} and the admin detail, before and after an admin merge moved old app accounts onto the account.
 */

const { client, db } = createDb(TEST_DATABASE_URL, 2)
afterAll(async () => {
  await client.end()
})

type Json = Record<string, unknown>

async function api(method: "GET" | "POST", pathWithQuery: string, body?: unknown, app: keyof typeof APP_SECRETS = "tretu-web") {
  const raw = body === undefined ? "" : JSON.stringify(body)
  const headers = signRequest({ appId: app, secret: APP_SECRETS[app], method, pathWithQuery, body: raw })
  const res = await fetch(`${ISSUER}${pathWithQuery}`, { method, headers: { ...headers, ...(raw && { "content-type": "application/json" }) }, body: raw || undefined })
  return { status: res.status, body: (await res.json()) as Json }
}

const legacy = (userId: string, app: "saga" | "play" | "hollowmere" | "tretu-web", legacyUserId: string) =>
  db.insert(s.legacyLink).values({ app, legacyUserId, userId, legacyUsername: `old_${legacyUserId}`.slice(0, 40), method: "import" })

/** Signs in to saga with an existing auth session and returns the verified ID token claims and the userinfo. */
async function signInToSaga(jar: Parameters<typeof request>[0], sub: string) {
  const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
  const flow = startAuthorization(config, SAGA_REDIRECT)
  const res = await request(jar, await flow.url())
  expect(res.status).toBe(302)
  const tokens = await oidc.authorizationCodeGrant(config, new URL(res.headers.get("location")!), {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  })
  const { payload } = await jwtVerify(tokens.id_token!, createRemoteJWKSet(new URL(config.serverMetadata().jwks_uri!)), { issuer: ISSUER, audience: "saga" })
  const info = await oidc.fetchUserInfo(config, tokens.access_token, sub)
  return { idToken: payload as Json, userinfo: info as Json }
}

describe("legacy_ids claim", () => {
  const ids = {
    saga: String(Math.floor(Math.random() * 1e9)),
    web: String(Math.floor(Math.random() * 1e9)),
    play: `c${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    hollowmere: randomUUID(),
    secondSaga: String(Math.floor(Math.random() * 1e9) + 1e9),
  }
  let user: Awaited<ReturnType<typeof registerVerifiedUser>>
  let old: { id: string }
  let actor: { id: string }

  beforeAll(async () => {
    user = await registerVerifiedUser("legacyids")
    await legacy(user.id, "saga", ids.saga)
    await legacy(user.id, "tretu-web", ids.web)

    // An old, never-used account with Play, Hollowmere and a second Saga account (merged in below).
    const u = uniqueUser("legacyold")
    old = { id: randomUUID() }
    await db.insert(s.user).values({ id: old.id, name: u.name, email: u.email, emailVerified: true, username: u.username.toLowerCase(), displayUsername: u.username })
    await legacy(old.id, "play", ids.play)
    await legacy(old.id, "hollowmere", ids.hollowmere)
    await legacy(old.id, "saga", ids.secondSaga)

    const a = uniqueUser("legacyadm")
    actor = { id: randomUUID() }
    await db.insert(s.user).values({ id: actor.id, name: a.name, email: a.email, emailVerified: true, username: a.username.toLowerCase(), roles: ["admin"], twoFactorEnabled: true })
  })

  it("carries only the apps with a link, as strings, in the ID token, userinfo and the user shape", async () => {
    const { idToken, userinfo } = await signInToSaga(user.jar, user.id)
    const expected = { saga: ids.saga, "tretu-web": ids.web }
    expect(idToken.legacy_ids).toEqual(expected)
    expect(userinfo.legacy_ids).toEqual(expected)

    const shape = await api("GET", `/api/v1/users/${user.id}`, undefined, "saga")
    expect(shape.status).toBe(200)
    expect(shape.body.legacyIds).toEqual(expected)
    const detail = await api("GET", `/api/v1/admin/users/${user.id}`)
    expect(detail.body.legacyIds).toEqual(expected)

    // An account without old app accounts gets no claim at all (and an empty object in the user shape).
    const plain = await registerVerifiedUser("nolegacy")
    const none = await signInToSaga(plain.jar, plain.id)
    expect(none.idToken).not.toHaveProperty("legacy_ids")
    expect(none.userinfo).not.toHaveProperty("legacy_ids")
    expect((await api("GET", `/api/v1/users/${plain.id}`, undefined, "saga")).body.legacyIds).toEqual({})
  })

  it("follows an admin merge: the surviving account carries the moved ids, keeping its own per app", async () => {
    const merged = await api("POST", "/api/v1/admin/merge", { actorSub: actor.id, reason: "Altes Konto zusammenführen", from: old.id, into: user.id, dryRun: false })
    expect(merged.status).toBe(200)
    expect(merged.body).toMatchObject({ ok: true, merged: true })

    const expected = { saga: ids.saga, play: ids.play, hollowmere: ids.hollowmere, "tretu-web": ids.web }
    const { idToken, userinfo } = await signInToSaga(user.jar, user.id)
    expect(idToken.legacy_ids).toEqual(expected)
    expect(userinfo.legacy_ids).toEqual(expected)
    expect((await api("GET", `/api/v1/users/${user.id}`, undefined, "saga")).body.legacyIds).toEqual(expected)

    // The apps hear about it: user.updated of the survivor carries them, user.deleted of the old one names it.
    const [updated] = await db
      .select()
      .from(s.eventOutbox)
      .where(and(eq(s.eventOutbox.sub, user.id), eq(s.eventOutbox.type, "user.updated")))
      .orderBy(desc(s.eventOutbox.createdAt))
    expect(updated!.envelope).toMatchObject({ data: { sub: user.id, legacyIds: expected } })
    const [deleted] = await db.select().from(s.eventOutbox).where(and(eq(s.eventOutbox.sub, old.id), eq(s.eventOutbox.type, "user.deleted")))
    expect(deleted!.envelope).toMatchObject({ data: { mergedInto: user.id } })
  })
})
