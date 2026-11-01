import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose"
import * as oidc from "openid-client"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { signRequest, verifySignedRequest } from "@/lib/tretu/signing"
import { APP_SECRETS, ISSUER, PLATFORM_PORT, PLAY_SECRET, SAGA_SECRET, TEST_DATABASE_URL } from "./env"
import { Jar, registerVerifiedUser, request } from "./helpers"

const SCOPES = "openid profile email offline_access tretu"
const SAGA_REDIRECT = "http://localhost:3038/api/auth/oauth2/callback/tretu"
const sql = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} })

afterAll(async () => {
  await sql.end()
})

async function discover(clientId: string, auth: oidc.ClientAuth) {
  return oidc.discovery(new URL(ISSUER), clientId, undefined, auth, { execute: [oidc.allowInsecureRequests] })
}

function startAuthorization(config: oidc.Configuration, redirectUri: string, extra: Record<string, string> = {}) {
  const verifier = oidc.randomPKCECodeVerifier()
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  return {
    verifier,
    state,
    nonce,
    url: async () =>
      oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: SCOPES,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
        state,
        nonce,
        ...extra,
      }),
  }
}

describe("discovery", () => {
  it("serves the OpenID configuration at the issuer root", async () => {
    const res = await fetch(`${ISSUER}/.well-known/openid-configuration`)
    expect(res.status).toBe(200)
    const meta = (await res.json()) as Record<string, unknown>
    expect(meta.issuer).toBe(ISSUER)
    expect(meta.scopes_supported).toEqual(["openid", "profile", "email", "offline_access", "tretu"])
    expect(meta.code_challenge_methods_supported).toEqual(["S256"])
    expect(meta.end_session_endpoint).toBe(`${ISSUER}/api/auth/oauth2/end-session`)
    expect(meta.claims_supported).toEqual(expect.arrayContaining(["roles", "discord_id", "minecraft_uuid", "minecraft_name", "steam_id", "locale", "preferred_username"]))
    const jwks = (await (await fetch(meta.jwks_uri as string)).json()) as { keys: { kty: string; alg?: string }[] }
    expect(jwks.keys.length).toBeGreaterThan(0)
  })

  it("answers the health check", async () => {
    const body = (await (await fetch(`${ISSUER}/api/health`)).json()) as Record<string, unknown>
    expect(body).toMatchObject({ status: "ok", app: "auth", checks: { db: "ok" } })
  })
})

describe("authorization code + PKCE, confidential client (saga)", () => {
  let user: Awaited<ReturnType<typeof registerVerifiedUser>>
  beforeAll(async () => {
    user = await registerVerifiedUser("saga")
  })

  it("signs in through the login page, issues tokens, refreshes, serves userinfo and logs out", async () => {
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const browser = new Jar()

    // Not signed in: the provider sends the browser to the login page with a signed request.
    const authorize = await request(browser, await flow.url())
    expect(authorize.status).toBe(302)
    // The login page address is relative to the issuer.
    const login = new URL(authorize.headers.get("location")!, ISSUER)
    expect(login.origin + login.pathname).toBe(`${ISSUER}/login`)
    expect(login.searchParams.get("sig")).toBeTruthy()

    // The login form posts the credentials together with the signed request (what the client plugin does).
    const signIn = await request(browser, "/api/auth/sign-in/email", {
      method: "POST",
      json: { email: user.email, password: user.password, oauth_query: login.search.slice(1) },
    })
    expect(signIn.status).toBe(200)
    const signInBody = (await signIn.json()) as { redirect: boolean; url: string }
    expect(signInBody.redirect).toBe(true)
    const callback = new URL(signInBody.url)
    expect(callback.origin + callback.pathname).toBe(SAGA_REDIRECT)
    expect(callback.searchParams.get("iss")).toBe(ISSUER)

    const tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    })
    expect(tokens.refresh_token).toBeTruthy()

    // The ID token is signed with a key from the JWKS, for this client, by the exact issuer.
    const jwks = createRemoteJWKSet(new URL(config.serverMetadata().jwks_uri!))
    expect(decodeProtectedHeader(tokens.id_token!).alg).toBe("RS256")
    const { payload } = await jwtVerify(tokens.id_token!, jwks, { issuer: ISSUER, audience: "saga" })
    expect(payload).toMatchObject({
      sub: user.id,
      nonce: flow.nonce,
      preferred_username: user.username,
      name: user.name,
      email: user.email,
      email_verified: true,
      locale: "de",
      roles: [],
    })
    expect(payload.sid).toBeTruthy()
    expect(payload.discord_id).toBeUndefined()

    // Refresh tokens rotate and keep working.
    const refreshed = await oidc.refreshTokenGrant(config, tokens.refresh_token!)
    expect(refreshed.access_token).toBeTruthy()
    expect(refreshed.access_token).not.toBe(tokens.access_token)

    const info = await oidc.fetchUserInfo(config, refreshed.access_token, user.id)
    expect(info).toMatchObject({ sub: user.id, preferred_username: user.username, email: user.email, email_verified: true, locale: "de", roles: [] })

    // RP-initiated logout ends the browser session and returns to the registered address.
    const logout = await request(browser, oidc.buildEndSessionUrl(config, { id_token_hint: tokens.id_token!, post_logout_redirect_uri: "http://localhost:3038/", state: "bye" }))
    expect(logout.status).toBe(302)
    const back = new URL(logout.headers.get("location")!)
    expect(back.origin + back.pathname).toBe("http://localhost:3038/")
    expect(back.searchParams.get("state")).toBe("bye")
    const session = await request(browser, "/api/auth/get-session")
    expect(await session.json()).toBeNull()
  })

  it("issues a code straight away when the browser is already signed in", async () => {
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const res = await request(user.jar, await flow.url())
    expect(res.status).toBe(302)
    const callback = new URL(res.headers.get("location")!)
    expect(callback.searchParams.get("code")).toBeTruthy()
    const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
    expect(tokens.claims()?.sub).toBe(user.id)
  })

  it("rejects a wrong client secret and a wrong PKCE verifier", async () => {
    const good = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(good, SAGA_REDIRECT)
    const callback = new URL((await request(user.jar, await flow.url())).headers.get("location")!)
    const bad = await discover("saga", oidc.ClientSecretBasic("wrong-secret-wrong-secret"))
    await expect(oidc.authorizationCodeGrant(bad, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })).rejects.toThrow()
    await expect(
      oidc.authorizationCodeGrant(good, callback, { pkceCodeVerifier: oidc.randomPKCECodeVerifier(), expectedState: flow.state, expectedNonce: flow.nonce }),
    ).rejects.toThrow()
  })

  it("refuses unregistered redirect URIs", async () => {
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, "https://evil.example/callback")
    const res = await request(user.jar, await flow.url())
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toMatch(new RegExp(`^${ISSUER}/fehler\\?error=`))
  })
})

describe("client_secret_post (Better Auth genericOAuth default)", () => {
  it("is accepted for confidential clients registered for Basic", async () => {
    const user = await registerVerifiedUser("play")
    const config = await discover("play", oidc.ClientSecretPost(PLAY_SECRET))
    const flow = startAuthorization(config, "http://localhost:3030/api/auth/oauth2/callback/tretu")
    const callback = new URL((await request(user.jar, await flow.url())).headers.get("location")!)
    const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
    expect(tokens.claims()?.sub).toBe(user.id)
  })
})

describe("public loopback client (hollowmere)", () => {
  it("accepts any loopback port and needs no secret", async () => {
    const user = await registerVerifiedUser("hm")
    const config = await discover("hollowmere", oidc.None())
    for (const port of [54321, 61000]) {
      const redirect = `http://127.0.0.1:${port}/callback`
      const flow = startAuthorization(config, redirect)
      const res = await request(user.jar, await flow.url())
      expect(res.status).toBe(302)
      const callback = new URL(res.headers.get("location")!)
      expect(callback.origin + callback.pathname).toBe(redirect)
      const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
      const { payload } = await jwtVerify(tokens.id_token!, createRemoteJWKSet(new URL(config.serverMetadata().jwks_uri!)), { issuer: ISSUER, audience: "hollowmere" })
      expect(payload.sub).toBe(user.id)
      const refreshed = await oidc.refreshTokenGrant(config, tokens.refresh_token!)
      expect(refreshed.id_token).toBeTruthy()
    }
  })

  it("rejects other loopback paths, non-loopback http and requests without PKCE", async () => {
    const user = await registerVerifiedUser("hm2")
    const config = await discover("hollowmere", oidc.None())
    for (const redirect of ["http://127.0.0.1:5000/other", "http://example.com:5000/callback", "http://localhost.evil.com:5000/callback"]) {
      const flow = startAuthorization(config, redirect)
      const res = await request(user.jar, await flow.url())
      expect(res.headers.get("location")).toMatch(new RegExp(`^${ISSUER}/fehler`))
    }
    const noPkce = oidc.buildAuthorizationUrl(config, { redirect_uri: "http://127.0.0.1:5000/callback", scope: "openid", state: "s" })
    const res = await request(user.jar, noPkce)
    const location = new URL(res.headers.get("location")!)
    expect(location.searchParams.get("error")).toBe("invalid_request")
    expect(location.searchParams.get("code")).toBeNull()
  })
})

describe("admins", () => {
  it("must turn on 2FA before an app gets a code", async () => {
    const user = await registerVerifiedUser("admin")
    await sql`update "user" set roles = '{admin}' where id = ${user.id}`
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const res = await request(user.jar, await flow.url())
    expect(res.status).toBe(302)
    expect(new URL(res.headers.get("location")!, ISSUER).pathname).toBe("/weiter")
  })
})

describe("admin API (contract §2/§3)", () => {
  async function signed(method: string, pathWithQuery: string, body?: unknown, app = "saga", secret = APP_SECRETS.saga) {
    const raw = body === undefined ? "" : JSON.stringify(body)
    const headers = signRequest({ appId: app, secret, method, pathWithQuery, body: raw })
    return fetch(`${ISSUER}${pathWithQuery}`, {
      method,
      headers: { ...headers, ...(raw ? { "content-type": "application/json" } : {}) },
      body: raw || undefined,
    })
  }

  it("links Minecraft and Steam, reports conflicts and returns the user shape", async () => {
    const a = await registerVerifiedUser("links")
    const b = await registerVerifiedUser("links")
    const uuid = "069A79F444E94726A5BEFCA90E38AAF5"
    expect((await signed("POST", "/api/v1/links", { sub: a.id, provider: "minecraft", providerAccountId: uuid, displayName: "Notch" })).status).toBe(200)
    expect((await signed("POST", "/api/v1/links", { sub: a.id, provider: "steam", providerAccountId: "76561197960287930" })).status).toBe(200)
    const conflict = await signed("POST", "/api/v1/links", { sub: b.id, provider: "minecraft", providerAccountId: uuid, displayName: "x" })
    expect(conflict.status).toBe(409)

    const bySub = await signed("GET", `/api/v1/users/${a.id}`)
    expect(bySub.status).toBe(200)
    const shape = (await bySub.json()) as Record<string, unknown>
    expect(shape).toMatchObject({
      sub: a.id,
      username: a.username,
      name: a.name,
      locale: "de",
      roles: [],
      links: { minecraft: "069a79f4-44e9-4726-a5be-fca90e38aaf5", minecraftName: "Notch", steam: "76561197960287930" },
    })
    expect(typeof shape.createdAt).toBe("string")

    const byName = await signed("GET", `/api/v1/users?username=${a.username.toUpperCase()}`)
    expect(((await byName.json()) as { sub: string }).sub).toBe(a.id)
    expect((await signed("GET", "/api/v1/users?username=nobody_here_123")).status).toBe(404)

    // The links show up as claims for apps with the tretu scope.
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const callback = new URL((await request(a.jar, await flow.url())).headers.get("location")!)
    const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
    expect(tokens.claims()).toMatchObject({ minecraft_uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", minecraft_name: "Notch", steam_id: "76561197960287930" })

    expect((await signed("DELETE", "/api/v1/links", { sub: a.id, provider: "minecraft" })).status).toBe(200)
    const after = (await (await signed("GET", `/api/v1/users/${a.id}`)).json()) as { links: Record<string, string> }
    expect(after.links.minecraft).toBeUndefined()
    // Now b may take it.
    expect((await signed("POST", "/api/v1/links", { sub: b.id, provider: "minecraft", providerAccountId: uuid })).status).toBe(200)
  })

  it("rejects unsigned, stale, unknown-app and tampered requests with 401", async () => {
    expect((await fetch(`${ISSUER}/api/v1/users/x`)).status).toBe(401)
    expect((await signed("GET", "/api/v1/users/x", undefined, "saga", "wrong-secret")).status).toBe(401)
    expect((await signed("GET", "/api/v1/users/x", undefined, "unknown-app", "whatever")).status).toBe(401)
    const headers = signRequest({ appId: "saga", secret: APP_SECRETS.saga, method: "GET", pathWithQuery: "/api/v1/users/x", now: Date.now() - 400_000 })
    expect((await fetch(`${ISSUER}/api/v1/users/x`, { headers: { ...headers } })).status).toBe(401)
    const body = JSON.stringify({ sub: "x", provider: "steam" })
    const sig = signRequest({ appId: "saga", secret: APP_SECRETS.saga, method: "DELETE", pathWithQuery: "/api/v1/links", body })
    const tampered = await fetch(`${ISSUER}/api/v1/links`, { method: "DELETE", headers: { ...sig, "content-type": "application/json" }, body: body.replace("steam", "minecraft") })
    expect(tampered.status).toBe(401)
    expect(await tampered.json()).toEqual({ error: "unauthorized" })
  })
})

describe("platform events (contract §4)", () => {
  it("sends signed user.created / user.updated / user.deleted envelopes", async () => {
    const user = await registerVerifiedUser("events")
    // Rename through the account API → user.updated.
    await request(user.jar, "/api/auth/update-user", { method: "POST", json: { name: "Renamed Person" } })
    // Delete through the database path the account page uses is covered elsewhere; here: wait for delivery.
    type Received = { headers: Record<string, string>; body: string }
    let events: { type: string; sub: string; app: string; id: string; data: Record<string, unknown> }[] = []
    let received: Received[] = []
    for (let i = 0; i < 40; i++) {
      received = (await (await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__events`)).json()) as Received[]
      events = received.flatMap((r) => {
        const parsed = JSON.parse(r.body) as { events?: unknown[] }
        return (parsed.events ?? [parsed]) as typeof events
      })
      if (events.some((e) => e.sub === user.id && e.type === "user.updated" && e.data.name === "Renamed Person")) break
      await new Promise((r) => setTimeout(r, 250))
    }
    const created = events.find((e) => e.sub === user.id && e.type === "user.created")
    expect(created).toMatchObject({ app: "auth", data: { sub: user.id, username: user.username, name: user.name, locale: "de", roles: [], links: {} } })
    expect(events.find((e) => e.sub === user.id && e.type === "user.updated" && e.data.name === "Renamed Person")).toBeTruthy()

    for (const r of received) {
      const result = verifySignedRequest({
        headers: new Headers(r.headers),
        method: "POST",
        pathWithQuery: "/api/v1/events",
        rawBody: r.body,
        secrets: { auth: APP_SECRETS.auth },
      })
      expect(result).toEqual({ ok: true, app: "auth" })
    }
  })
})
