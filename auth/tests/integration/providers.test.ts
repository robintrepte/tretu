import * as oidc from "openid-client"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { PROVIDER_MOCK, SAGA_SECRET, TEST_DATABASE_URL } from "./env"
import {
  discover,
  finishSocial,
  Jar,
  locationOf,
  loginPageQuery,
  mockProviderCode,
  registerVerifiedUser,
  request,
  SAGA_REDIRECT,
  sessionOf,
  startAuthorization,
  startSocial,
} from "./helpers"

/**
 * Discord, Google and Apple sign-ins through Better Auth's real provider code. Only the providers' HTTP endpoints
 * are fake (tests/support/provider-mock.ts, reached through the test-only fetch preload).
 */

const sql = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} })
afterAll(async () => {
  await sql.end()
})

let n = 0
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${++n}`
const numericId = () => `${Date.now()}${String(++n).padStart(4, "0")}`

async function signInWith(provider: "discord" | "google" | "apple", profile: Record<string, unknown>, options: { jar?: Jar; body?: Record<string, unknown>; extra?: Record<string, string>; forge?: boolean } = {}) {
  const jar = options.jar ?? new Jar()
  const { state } = await startSocial(jar, provider, options.body)
  const code = uid("code")
  await mockProviderCode(provider, code, profile, { forge: options.forge })
  const res = await finishSocial(jar, provider, state, code, options.extra)
  return { jar, res }
}

async function userByAccount(provider: string, accountId: string) {
  const [row] = await sql<{ id: string; username: string; email: string; email_verified: boolean; name: string }[]>`
    select u.id, u.username, u.email, u.email_verified, u.name from "user" u join account a on a.user_id = u.id
    where a.provider_id = ${provider} and a.account_id = ${accountId}`
  return row
}

describe("Discord", () => {
  it("signs up with a unique username, signs in again and continues an app sign-in", async () => {
    const handle = uid("dc")
    const first = { id: numericId(), username: handle, email: `${handle}@example.test`, verified: true }
    const { jar, res } = await signInWith("discord", first)
    expect(res.status).toBe(302)
    expect(locationOf(res).pathname).toBe("/konto")
    const session = await sessionOf(jar)
    const created = await userByAccount("discord", first.id)
    expect(session?.user.id).toBe(created?.id)
    expect(created).toMatchObject({ username: handle.toLowerCase(), email: first.email, email_verified: true })

    // Another Discord user with the same handle gets a free variant of it.
    const second = { id: numericId(), username: handle, email: `${handle}.2@example.test`, verified: true }
    await signInWith("discord", second)
    const other = await userByAccount("discord", second.id)
    expect(other!.username).not.toBe(created!.username)
    expect(other!.username.startsWith(handle.toLowerCase().slice(0, 19))).toBe(true)

    // Signing in again finds the same account; inside an app sign-in the app gets a code.
    const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
    const flow = startAuthorization(config, SAGA_REDIRECT)
    const browser = new Jar()
    const oauthQuery = await loginPageQuery(browser, await flow.url())
    const again = await signInWith("discord", first, { jar: browser, body: { oauth_query: oauthQuery } })
    const callback = locationOf(again.res)
    expect(callback.origin + callback.pathname).toBe(SAGA_REDIRECT)
    const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
    expect(tokens.claims()).toMatchObject({ sub: created!.id, discord_id: first.id, email_verified: true })
  })

  it("never takes over an existing account through an unverified email; links it when Discord verified the email", async () => {
    const owner = await registerVerifiedUser("dcowner")
    const unverified = { id: numericId(), username: uid("dcx"), email: owner.email, verified: false }
    const refused = await signInWith("discord", unverified)
    expect(locationOf(refused.res).pathname).toBe("/login")
    expect(locationOf(refused.res).searchParams.get("error")).toBe("account_not_linked")
    expect(await sessionOf(refused.jar)).toBeNull()
    expect(await userByAccount("discord", unverified.id)).toBeUndefined()

    const verified = { id: numericId(), username: uid("dcy"), email: owner.email, verified: true }
    const linked = await signInWith("discord", verified)
    expect((await sessionOf(linked.jar))?.user.id).toBe(owner.id)
    expect((await userByAccount("discord", verified.id))?.id).toBe(owner.id)
  })

  it("creates new accounts with an unverified Discord email as unverified", async () => {
    const handle = uid("dcu")
    const profile = { id: numericId(), username: handle, email: `${handle}@example.test`, verified: false }
    const { jar } = await signInWith("discord", profile)
    expect(await sessionOf(jar)).not.toBeNull()
    expect(await userByAccount("discord", profile.id)).toMatchObject({ email_verified: false })
  })

  it("links from Mein Konto, refuses identities of other accounts, and unlinks only while another method remains", async () => {
    const user = await registerVerifiedUser("dclink")
    const start = await request(user.jar, "/api/auth/link-social", { method: "POST", json: { provider: "discord", callbackURL: "/konto?tab=konten", errorCallbackURL: "/fehler" } })
    expect(start.status).toBe(200)
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get("state")!
    const profile = { id: numericId(), username: uid("dcl"), email: `other.${uid("m")}@example.test`, verified: true }
    await mockProviderCode("discord", "link-code-1", profile)
    const back = await request(user.jar, `/api/auth/callback/discord?code=link-code-1&state=${state}`)
    expect(locationOf(back).pathname + locationOf(back).search).toBe("/konto?tab=konten")
    expect((await userByAccount("discord", profile.id))?.id).toBe(user.id)
    const [audit] = await sql`select meta from audit_log where user_id = ${user.id} and event = 'link.added'`
    expect(audit?.meta).toMatchObject({ provider: "discord" })

    // The Mein Konto page lists it with "Trennen".
    const page = await (await request(user.jar, "/konto?tab=konten")).text()
    expect(page).toContain('data-testid="connection-discord"')
    expect(page).toContain("Trennen")

    // A Discord account already used by someone else cannot be linked.
    const other = await registerVerifiedUser("dclink2")
    const start2 = await request(other.jar, "/api/auth/link-social", { method: "POST", json: { provider: "discord", callbackURL: "/konto?tab=konten", errorCallbackURL: "/fehler" } })
    const state2 = new URL(((await start2.json()) as { url: string }).url).searchParams.get("state")!
    await mockProviderCode("discord", "link-code-2", profile)
    const refused = await request(other.jar, `/api/auth/callback/discord?code=link-code-2&state=${state2}`)
    expect(locationOf(refused).pathname).toBe("/fehler")
    expect(locationOf(refused).searchParams.get("error")).toBe("account_already_linked_to_different_user")

    // Unlink: the password remains, so it is allowed (with the Better Auth row id).
    const [row] = await sql<{ id: string }[]>`select id from account where provider_id = 'discord' and account_id = ${profile.id}`
    const unlink = await request(user.jar, "/api/auth/unlink-account", { method: "POST", json: { accountId: row!.id } })
    expect(unlink.status).toBe(200)
    expect(await userByAccount("discord", profile.id)).toBeUndefined()
    const [removed] = await sql`select meta from audit_log where user_id = ${user.id} and event = 'link.removed'`
    expect(removed?.meta).toMatchObject({ provider: "discord" })
  })

  it("keeps Discord on a Discord-only account (last sign-in method)", async () => {
    const handle = uid("dco")
    const profile = { id: numericId(), username: handle, email: `${handle}@example.test`, verified: true }
    const { jar } = await signInWith("discord", profile)
    const [row] = await sql<{ id: string }[]>`select id from account where provider_id = 'discord' and account_id = ${profile.id}`
    const unlink = await request(jar, "/api/auth/unlink-account", { method: "POST", json: { accountId: row!.id } })
    expect(unlink.status).toBe(400)
    expect(((await unlink.json()) as { code: string }).code).toBe("FAILED_TO_UNLINK_LAST_ACCOUNT")
    expect(await userByAccount("discord", profile.id)).toBeTruthy()
  })
})

describe("Google", () => {
  it("signs up with the given name as username and links only to a verified local email", async () => {
    const given = uid("Gina")
    const profile = { sub: numericId(), email: `${given.toLowerCase()}@gmail.test`, email_verified: true, name: `${given} Example`, given_name: given, picture: "https://lh3.googleusercontent.com/a/x" }
    const { jar, res } = await signInWith("google", profile)
    expect(locationOf(res).pathname).toBe("/konto")
    expect((await sessionOf(jar))?.user.id).toBeTruthy()
    expect(await userByAccount("google", profile.sub)).toMatchObject({ username: given.toLowerCase(), email_verified: true, name: `${given} Example` })

    // Trusted provider: an existing, verified account with the same email is joined.
    const owner = await registerVerifiedUser("gowner")
    const joined = await signInWith("google", { sub: numericId(), email: owner.email, email_verified: true, name: "Owner", given_name: "Owner" })
    expect((await sessionOf(joined.jar))?.user.id).toBe(owner.id)

    // …but never an account whose own email was not confirmed.
    const unconfirmed = `unconfirmed.${uid("u")}@example.test`
    const signUp = await request(new Jar(), "/api/auth/sign-up/email", { method: "POST", json: { email: unconfirmed, password: "correct horse battery staple 42", name: "U", username: uid("unc") } })
    expect(signUp.ok).toBe(true)
    const refused = await signInWith("google", { sub: numericId(), email: unconfirmed, email_verified: true, name: "Mallory", given_name: "Mallory" })
    expect(locationOf(refused.res).searchParams.get("error")).toBe("account_not_linked")
    expect(await sessionOf(refused.jar)).toBeNull()
  })
})

describe("Apple", () => {
  it("accepts the form_post callback and an ID token signed with a key from Apple's JWKS", async () => {
    const sub = `001234.${uid("apple")}.0001`
    const email = `${uid("ap")}@privaterelay.appleid.test`
    const user = JSON.stringify({ name: { firstName: "Ada", lastName: "Apfel" }, email })
    const { jar, res } = await signInWith("apple", { sub, email, email_verified: "true", is_private_email: "true" }, { extra: { user } })
    expect(res.status).toBe(302)
    expect(locationOf(res).pathname).toBe("/konto")
    expect((await sessionOf(jar))?.user.id).toBeTruthy()
    expect(await userByAccount("apple", sub)).toMatchObject({ name: "Ada Apfel", email, email_verified: true })
    // The key set was fetched from (the mock of) appleid.apple.com/auth/keys.
    const log = (await (await fetch(`${PROVIDER_MOCK}/__mock/log`)).json()) as { host: string; path: string }[]
    expect(log).toEqual(expect.arrayContaining([{ host: "appleid.apple.com", path: "/auth/keys", method: "GET" }]))
  })

  it("rejects an ID token that is not signed by Apple", async () => {
    const sub = `001234.${uid("forged")}.0001`
    const { jar, res } = await signInWith("apple", { sub, email: `${uid("f")}@example.test`, email_verified: "true" }, { forge: true })
    expect(locationOf(res).searchParams.get("error")).toBeTruthy()
    expect(await sessionOf(jar)).toBeNull()
    expect(await userByAccount("apple", sub)).toBeUndefined()
  })
})
