import * as oidc from "openid-client"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { signRequest } from "@/lib/tretu/signing"
import { APP_SECRETS, ISSUER, PLATFORM_PORT, SAGA_SECRET, TEST_DATABASE_URL } from "./env"
import {
  discover,
  Jar,
  locationOf,
  loginPageQuery,
  mockSteamPlayer,
  registerVerifiedUser,
  request,
  SAGA_REDIRECT,
  sessionOf,
  startAuthorization,
  steamAssertion,
  steamNext,
  steamSignIn,
} from "./helpers"

/** "Mit Steam anmelden" against the local stub Steam OpenID provider (STEAM_OPENID_ENDPOINT, tests only). */

const sql = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} })
afterAll(async () => {
  await sql.end()
})

let n = 0
const steamId = () => String(76561198100000000n + BigInt(Date.now() % 1_000_000) * 100n + BigInt(++n))

async function steamUser(id: string) {
  const [row] = await sql<{ id: string; username: string; name: string; email: string; email_verified: boolean; image: string | null; display_name: string | null }[]>`
    select u.id, u.username, u.name, u.email, u.email_verified, u.image, a.display_name from "user" u join account a on a.user_id = u.id
    where a.provider_id = 'steam' and a.account_id = ${id}`
  return row
}

async function startSteam(jar: Jar, body: Record<string, unknown> = {}, path = "/api/auth/sign-in/steam") {
  const res = await request(jar, path, { method: "POST", json: { callbackURL: "/konto", errorCallbackURL: "/login", ...body } })
  expect(res.status).toBe(200)
  const url = new URL(((await res.json()) as { url: string }).url)
  return { url, returnTo: url.searchParams.get("openid.return_to")! }
}

async function signed(method: string, pathWithQuery: string, body?: unknown, app = "saga") {
  const raw = body === undefined ? "" : JSON.stringify(body)
  const headers = signRequest({ appId: app, secret: APP_SECRETS[app as keyof typeof APP_SECRETS], method, pathWithQuery, body: raw })
  return fetch(`${ISSUER}${pathWithQuery}`, { method, headers: { ...headers, ...(raw ? { "content-type": "application/json" } : {}) }, body: raw || undefined })
}

type Event = { type: string; sub: string; data: { links?: Record<string, string> } }
async function waitForEvent(match: (e: Event) => boolean): Promise<Event> {
  for (let i = 0; i < 60; i++) {
    const received = (await (await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__events`)).json()) as { body: string }[]
    const events = received.flatMap((r) => {
      const parsed = JSON.parse(r.body) as { events?: Event[] } & Event
      return parsed.events ?? [parsed]
    })
    const found = events.find(match)
    if (found) return found
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("event not delivered")
}

describe("Steam sign-in", () => {
  it("sends the browser to Steam with checkid_setup, realm and return_to on the issuer", async () => {
    const { url, returnTo } = await startSteam(new Jar())
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup")
    expect(url.searchParams.get("openid.realm")).toBe(`${ISSUER}/`)
    expect(returnTo).toMatch(new RegExp(`^${ISSUER}/api/auth/steam/callback\\?state=[A-Za-z0-9_-]+$`))
  })

  it("signs up with a unique username from the persona name, then signs in again", async () => {
    const id = steamId()
    await mockSteamPlayer(id, "Gaben der Große")
    const jar = new Jar()
    const res = await steamSignIn(jar, id)
    expect(locationOf(res).pathname).toBe("/konto")
    const user = await steamUser(id)
    expect((await sessionOf(jar))?.user.id).toBe(user?.id)
    expect(user).toMatchObject({ name: "Gaben der Große", display_name: "Gaben der Große", email_verified: false, image: `https://avatars.steamstatic.com/${id}_full.jpg` })
    expect(user!.username).toMatch(/^gaben_der_grosse/)
    expect(user!.email).toMatch(/@users\.tretu\.invalid$/)

    const twin = steamId()
    await mockSteamPlayer(twin, "Gaben der Große")
    await steamSignIn(new Jar(), twin)
    expect((await steamUser(twin))!.username).not.toBe(user!.username)

    const again = new Jar()
    await steamSignIn(again, id)
    expect((await sessionOf(again))?.user.id).toBe(user!.id)
    const [login] = await sql`select meta from audit_log where user_id = ${user!.id} and event = 'login' order by created_at desc limit 1`
    expect(login?.meta).toMatchObject({ method: "steam" })
  })

  it("continues an app sign-in and puts steam_id into the ID token", async () => {
    const id = steamId()
    await mockSteamPlayer(id, "Flow Tester")
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const browser = new Jar()
    const oauthQuery = await loginPageQuery(browser, await flow.url())
    const back = await steamSignIn(browser, id, { oauth_query: oauthQuery })
    const authorize = locationOf(back)
    expect(authorize.pathname).toBe("/api/auth/oauth2/authorize")
    const callback = locationOf(await request(browser, authorize))
    expect(callback.origin + callback.pathname).toBe(SAGA_REDIRECT)
    const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
    expect(tokens.claims()).toMatchObject({ steam_id: id, preferred_username: expect.stringMatching(/^Flow_Tester/i), email_verified: false })
  })

  it("links and unlinks Steam in Mein Konto (audit, user.updated with links.steam)", async () => {
    const user = await registerVerifiedUser("steamlink")
    const id = steamId()
    await mockSteamPlayer(id, "Linky")
    const res = await steamSignIn(user.jar, id, { callbackURL: "/konto?tab=konten", errorCallbackURL: "/konto?tab=konten" }, "/api/auth/steam/link")
    expect(locationOf(res).pathname + locationOf(res).search).toBe("/konto?tab=konten")
    expect((await steamUser(id))?.id).toBe(user.id)
    const [added] = await sql`select meta from audit_log where user_id = ${user.id} and event = 'link.added'`
    expect(added?.meta).toMatchObject({ provider: "steam" })
    expect(await waitForEvent((e) => e.sub === user.id && e.type === "user.updated" && e.data.links?.steam === id)).toBeTruthy()

    const page = await (await request(user.jar, "/konto?tab=konten")).text()
    expect(page).toContain('data-testid="game-steam"')
    expect(page).toContain(`Linky · ${id}`)

    const [row] = await sql<{ id: string }[]>`select id from account where provider_id = 'steam' and account_id = ${id}`
    expect((await request(user.jar, "/api/auth/unlink-account", { method: "POST", json: { accountId: row!.id } })).status).toBe(200)
    expect(await steamUser(id)).toBeUndefined()
    const [removed] = await sql`select meta from audit_log where user_id = ${user.id} and event = 'link.removed'`
    expect(removed?.meta).toMatchObject({ provider: "steam" })
    expect(await waitForEvent((e) => e.sub === user.id && e.type === "user.updated" && !e.data.links?.steam)).toBeTruthy()
  })

  it("refuses to link a Steam account of someone else and keeps Steam on Steam-only accounts", async () => {
    const id = steamId()
    const owner = new Jar()
    await steamSignIn(owner, id)
    const other = await registerVerifiedUser("steamother")
    const res = await steamSignIn(other.jar, id, { callbackURL: "/konto?tab=konten", errorCallbackURL: "/konto?tab=konten" }, "/api/auth/steam/link")
    expect(locationOf(res).searchParams.get("error")).toBe("account_already_linked_to_different_user")

    const [row] = await sql<{ id: string }[]>`select id from account where provider_id = 'steam' and account_id = ${id}`
    const unlink = await request(owner, "/api/auth/unlink-account", { method: "POST", json: { accountId: row!.id } })
    expect(unlink.status).toBe(400)
    expect(await steamUser(id)).toBeTruthy()
  })
})

describe("Steam assertion checks (end to end)", () => {
  it("refuses a tampered assertion (Steam does not confirm it)", async () => {
    const jar = new Jar()
    const { url } = await startSteam(jar)
    await steamNext({ steamId: "76561198000000001" })
    const answer = locationOf(await fetch(url, { redirect: "manual" }))
    const victim = "https://steamcommunity.com/openid/id/76561197960999999"
    answer.searchParams.set("openid.claimed_id", victim)
    answer.searchParams.set("openid.identity", victim)
    const res = await request(jar, answer)
    expect(locationOf(res).pathname).toBe("/login")
    expect(locationOf(res).searchParams.get("error")).toBe("steam_failed")
    expect(await sessionOf(jar)).toBeNull()
    expect(await steamUser("76561197960999999")).toBeUndefined()
  })

  it("refuses replays: the same callback again, and the same nonce in a new flow", async () => {
    const id = steamId()
    const jar = new Jar()
    const { returnTo } = await startSteam(jar)
    const nonce = `${new Date().toISOString().slice(0, 19)}Zreplay${n}`
    const first = new URL(returnTo)
    for (const [k, v] of await steamAssertion(returnTo, id, { nonce })) first.searchParams.append(k, v)
    expect(locationOf(await request(jar, first)).pathname).toBe("/konto")

    // The state was used up (cookie and server side): the identical callback is refused.
    const again = new Jar()
    for (const [k, v] of jar.cookies) if (!k.includes("session")) again.cookies.set(k, v)
    expect(locationOf(await request(again, first)).searchParams.get("error")).toBe("state_mismatch")

    // A brand-new flow with Steam's old nonce is refused as a replay.
    const jar2 = new Jar()
    const second = await startSteam(jar2)
    const replay = new URL(second.returnTo)
    for (const [k, v] of await steamAssertion(second.returnTo, id, { nonce })) replay.searchParams.append(k, v)
    const res = await request(jar2, replay)
    expect(locationOf(res).searchParams.get("error")).toBe("steam_failed")
    expect(await sessionOf(jar2)).toBeNull()
  })

  it("refuses an assertion for another return_to, another OpenID endpoint and a different browser", async () => {
    const id = steamId()
    const a = new Jar()
    const flowA = await startSteam(a)
    const b = new Jar()
    const flowB = await startSteam(b)
    // Signed for B's return_to, delivered to A's.
    const crossed = new URL(flowA.returnTo)
    for (const [k, v] of await steamAssertion(flowB.returnTo, id)) crossed.searchParams.append(k, v)
    expect(locationOf(await request(a, crossed)).searchParams.get("error")).toBe("steam_failed")

    const c = new Jar()
    const flowC = await startSteam(c)
    const wrongOp = new URL(flowC.returnTo)
    for (const [k, v] of await steamAssertion(flowC.returnTo, id, { opEndpoint: "https://steamcommunity.com/openid/login" })) wrongOp.searchParams.append(k, v)
    expect(locationOf(await request(c, wrongOp)).searchParams.get("error")).toBe("steam_failed")

    // A genuine assertion opened in another browser (no state cookie) is refused.
    const d = new Jar()
    const flowD = await startSteam(d)
    const elsewhere = new URL(flowD.returnTo)
    for (const [k, v] of await steamAssertion(flowD.returnTo, id)) elsewhere.searchParams.append(k, v)
    expect(locationOf(await request(new Jar(), elsewhere)).searchParams.get("error")).toBe("state_mismatch")
    expect(await steamUser(id)).toBeUndefined()
  })

  it("treats cancelling at Steam as access_denied", async () => {
    const jar = new Jar()
    const { url } = await startSteam(jar)
    await steamNext({ cancel: true })
    const res = await request(jar, locationOf(await fetch(url, { redirect: "manual" })))
    expect(locationOf(res).searchParams.get("error")).toBe("access_denied")
    await steamNext({ steamId: "76561198000000001" })
  })

  it("refuses redirect targets on other sites", async () => {
    for (const callbackURL of ["https://evil.example/", "//evil.example", "/\t/evil.example"]) {
      const res = await request(new Jar(), "/api/auth/sign-in/steam", { method: "POST", json: { callbackURL } })
      expect(res.status, callbackURL).toBe(403)
    }
  })
})

describe("admin API: Steam and TeamSpeak links", () => {
  it("links Steam as a sign-in identity and TeamSpeak as a link, with 409 on conflicts", async () => {
    const a = await registerVerifiedUser("tsa")
    const b = await registerVerifiedUser("tsb")
    const ts = `aB3+/xYz${Date.now().toString(36)}kLmNo=`
    const steam = steamId()
    // tretu.de links TeamSpeak from /einstellungen, signed as app tretu-web.
    expect((await signed("POST", "/api/v1/links", { sub: a.id, provider: "teamspeak", providerAccountId: ts, displayName: "RobinTS" }, "tretu-web")).status).toBe(200)
    expect((await signed("POST", "/api/v1/links", { sub: b.id, provider: "teamspeak", providerAccountId: ts })).status).toBe(409)
    expect((await signed("POST", "/api/v1/links", { sub: a.id, provider: "teamspeak", providerAccountId: "not valid!" })).status).toBe(400)
    expect((await signed("POST", "/api/v1/links", { sub: a.id, provider: "steam", providerAccountId: steam, displayName: "SteamA" })).status).toBe(200)
    expect((await signed("POST", "/api/v1/links", { sub: b.id, provider: "steam", providerAccountId: steam })).status).toBe(409)

    const shape = (await (await signed("GET", `/api/v1/users/${a.id}`)).json()) as { links: Record<string, string> }
    expect(shape.links).toMatchObject({ teamspeak: ts, teamspeakName: "RobinTS", steam })
    expect(await waitForEvent((e) => e.sub === a.id && e.type === "user.updated" && e.data.links?.teamspeak === ts)).toBeTruthy()
    const [audit] = await sql`select meta from audit_log where user_id = ${a.id} and event = 'link.added' and meta->>'provider' = 'teamspeak'`
    expect(audit?.meta).toMatchObject({ provider: "teamspeak", by: "tretu-web" })

    // teamspeak_uid with the tretu scope.
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const callback = locationOf(await request(a.jar, await flow.url()))
    const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
    expect(tokens.claims()).toMatchObject({ teamspeak_uid: ts, steam_id: steam })
    const info = await oidc.fetchUserInfo(config, tokens.access_token, a.id)
    expect(info).toMatchObject({ teamspeak_uid: ts })

    // Mein Konto shows the rows; unlinking TeamSpeak through the API.
    const page = await (await request(a.jar, "/konto?tab=konten")).text()
    expect(page).toContain(`RobinTS · ${ts}`)
    expect(page).toContain('data-testid="game-minecraft"')
    expect(page).toContain("https://mc.tretu.de/verknuepfen")
    expect((await signed("DELETE", "/api/v1/links", { sub: a.id, provider: "teamspeak" })).status).toBe(200)
    const after = (await (await signed("GET", `/api/v1/users/${a.id}`)).json()) as { links: Record<string, string> }
    expect(after.links.teamspeak).toBeUndefined()
    const [removed] = await sql`select meta from audit_log where user_id = ${a.id} and event = 'link.removed' and meta->>'provider' = 'teamspeak'`
    expect(removed).toBeTruthy()
    // b may take it now.
    expect((await signed("POST", "/api/v1/links", { sub: b.id, provider: "teamspeak", providerAccountId: ts })).status).toBe(200)
  })

  it("does not remove Steam through the API when it is the only way to sign in", async () => {
    const id = steamId()
    const jar = new Jar()
    await steamSignIn(jar, id)
    const user = await steamUser(id)
    const res = await signed("DELETE", "/api/v1/links", { sub: user!.id, provider: "steam" })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: "last_sign_in_method" })
  })
})
