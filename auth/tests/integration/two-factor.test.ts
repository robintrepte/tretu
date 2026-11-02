import { randomUUID } from "node:crypto"
import * as oidc from "openid-client"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { SAGA_SECRET, TEST_DATABASE_URL } from "./env"
import {
  discover,
  enableTwoFactor,
  type TotpDevice,
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
  waitForMail,
} from "./helpers"

/**
 * Two-factor accounts: every sign-in method except passkeys ends at /2fa, and until the code is entered there is
 * no session — no OIDC code for any app, no /konto, no API.
 */

const sql = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} })
afterAll(async () => {
  await sql.end()
})

let user: Awaited<ReturnType<typeof registerVerifiedUser>>
let device: TotpDevice
const ids = { discord: `${Date.now()}7001`, google: `g-${Date.now()}`, apple: `001.${Date.now()}.apple`, steam: String(76561198200000000n + BigInt(Date.now() % 1_000_000)) }

beforeAll(async () => {
  user = await registerVerifiedUser("twofa")
  device = await enableTwoFactor(user.jar, user.password)
  for (const [provider, accountId] of Object.entries(ids)) {
    await sql`insert into account (id, account_id, provider_id, user_id, created_at, updated_at) values (${randomUUID()}, ${accountId}, ${provider}, ${user.id}, now(), now())`
  }
})

let codeCounter = 0
async function viaProvider(jar: Jar, provider: "discord" | "google" | "apple", oauthQuery?: string) {
  const { state } = await startSocial(jar, provider, oauthQuery ? { oauth_query: oauthQuery } : {})
  const providerCode = `twofa-${provider}-${++codeCounter}`
  const profiles = {
    discord: { id: ids.discord, username: "twofa_dc", email: user.email, verified: true },
    google: { sub: ids.google, email: user.email, email_verified: true, name: "Two Fa", given_name: "Two" },
    apple: { sub: ids.apple, email: user.email, email_verified: "true" },
  }
  await mockProviderCode(provider, providerCode, profiles[provider])
  return finishSocial(jar, provider, state, providerCode)
}

/** The sign-in stopped at /2fa: nothing is usable yet. Returns the `next` target. */
async function expectChallenge(res: Response, browser: Jar): Promise<string> {
  const target = locationOf(res)
  expect(target.pathname).toBe("/2fa")
  expect(target.searchParams.has("code")).toBe(false)
  expect(browser.has("two_factor")).toBe(true)
  expect(await sessionOf(browser)).toBeNull()
  const konto = await request(browser, "/konto")
  expect(locationOf(konto).pathname).toBe("/login")
  const next = target.searchParams.get("next")!
  if (next.startsWith("/api/auth/oauth2/authorize")) {
    // The app's authorization request only leads to the login page, never to a code.
    const authorize = locationOf(await request(browser, next))
    expect(authorize.pathname).toBe("/login")
    expect(authorize.searchParams.has("code")).toBe(false)
  }
  return next
}

/**
 * Enters the second factor, follows `next` and checks that the app now gets a code for this user. TOTP codes work
 * once per 30 s step (replay protection), so most flows use backup codes to keep the suite fast.
 */
async function passAndExpectApp(browser: Jar, next: string, config: oidc.Configuration, flow: ReturnType<typeof startAuthorization>, factor: "totp" | "backup" = "backup") {
  const verify =
    factor === "totp"
      ? await request(browser, "/api/auth/two-factor/verify-totp", { method: "POST", json: { code: await device.code() } })
      : await request(browser, "/api/auth/two-factor/verify-backup-code", { method: "POST", json: { code: device.backupCode() } })
  expect(verify.status).toBe(200)
  expect((await sessionOf(browser))?.user.id).toBe(user.id)
  const callback = locationOf(await request(browser, next))
  expect(callback.origin + callback.pathname).toBe(SAGA_REDIRECT)
  const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
  expect(tokens.claims()?.sub).toBe(user.id)
}

async function appFlow() {
  const config = await discover("saga", oidc.ClientSecretBasic(SAGA_SECRET))
  const flow = startAuthorization(config, SAGA_REDIRECT)
  const browser = new Jar()
  const oauthQuery = await loginPageQuery(browser, await flow.url())
  return { config, flow, browser, oauthQuery }
}

describe("two-factor accounts inside an app sign-in", () => {
  for (const provider of ["discord", "google", "apple"] as const) {
    it(`${provider}: ends at /2fa, no code before the second factor`, async () => {
      const { config, flow, browser, oauthQuery } = await appFlow()
      const next = await expectChallenge(await viaProvider(browser, provider, oauthQuery), browser)
      await passAndExpectApp(browser, next, config, flow, provider === "discord" ? "totp" : "backup")
      const [challenge] = await sql`select meta from audit_log where user_id = ${user.id} and event = '2fa.challenge' order by created_at desc limit 1`
      expect(challenge?.meta).toMatchObject({ method: provider })
    })
  }

  it("steam: ends at /2fa, no code before the second factor", async () => {
    const { config, flow, browser, oauthQuery } = await appFlow()
    const next = await expectChallenge(await steamSignIn(browser, ids.steam, { oauth_query: oauthQuery }), browser)
    await passAndExpectApp(browser, next, config, flow)
  })

  it("magic link: ends at /2fa, no code before the second factor", async () => {
    const { config, flow, browser, oauthQuery } = await appFlow()
    const since = Date.now()
    const send = await request(browser, "/api/auth/sign-in/magic-link", { method: "POST", json: { email: user.email, callbackURL: `/login?${oauthQuery}` } })
    expect(send.status).toBe(200)
    const link = linkIn(await waitForMail(user.email, /Anmeldelink/, 10_000, since))
    const next = await expectChallenge(await request(browser, link), browser)
    await passAndExpectApp(browser, next, config, flow)
  })

  it("password: Better Auth's own challenge, no code before the second factor", async () => {
    const { config, flow, browser, oauthQuery } = await appFlow()
    const signIn = await request(browser, "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password, oauth_query: oauthQuery } })
    expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true })
    expect(await sessionOf(browser)).toBeNull()
    const verify = await request(browser, "/api/auth/two-factor/verify-backup-code", { method: "POST", json: { code: device.backupCode(), oauth_query: oauthQuery } })
    const body = (await verify.json()) as { redirect: boolean; url: string }
    expect(body.redirect).toBe(true)
    const callback = new URL(body.url)
    expect(callback.origin + callback.pathname).toBe(SAGA_REDIRECT)
    const tokens = await oidc.authorizationCodeGrant(config, callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
    expect(tokens.claims()?.sub).toBe(user.id)
  })
})

describe("two-factor accounts outside an app sign-in", () => {
  it("email confirmation links sign in only after the code", async () => {
    await sql`update "user" set email_verified = false where id = ${user.id}`
    const browser = new Jar()
    const since = Date.now()
    expect((await request(browser, "/api/auth/send-verification-email", { method: "POST", json: { email: user.email, callbackURL: "/konto?verified=1" } })).status).toBe(200)
    const link = linkIn(await waitForMail(user.email, /Bestätige deine E-Mail/, 10_000, since))
    const next = await expectChallenge(await request(browser, link), browser)
    expect(next).toBe("/konto?verified=1")
    expect((await request(browser, "/api/auth/two-factor/verify-backup-code", { method: "POST", json: { code: device.backupCode() } })).status).toBe(200)
    expect((await sessionOf(browser))?.user.id).toBe(user.id)
  })

  it("wrong codes do not help; a backup code works and can trust the device", async () => {
    const browser = new Jar()
    await expectChallenge(await viaProvider(browser, "discord"), browser)
    expect((await request(browser, "/api/auth/two-factor/verify-totp", { method: "POST", json: { code: "000000" } })).status).toBe(401)
    expect(await sessionOf(browser)).toBeNull()
    const backup = await request(browser, "/api/auth/two-factor/verify-backup-code", { method: "POST", json: { code: device.backupCode(), trustDevice: true } })
    expect(backup.status).toBe(200)
    expect((await sessionOf(browser))?.user.id).toBe(user.id)
    const audits = await sql`select event from audit_log where user_id = ${user.id} and event in ('2fa.failed', '2fa.backup_code_used')`
    expect(audits.map((a) => a.event)).toEqual(expect.arrayContaining(["2fa.failed", "2fa.backup_code_used"]))

    // Same browser, trusted for 30 days: the next provider sign-in needs no code.
    await request(browser, "/api/auth/sign-out", { method: "POST", json: {} })
    const res = await viaProvider(browser, "google")
    expect(locationOf(res).pathname).toBe("/konto")
    expect((await sessionOf(browser))?.user.id).toBe(user.id)
  })
})

describe("signed-in two-factor accounts", () => {
  it("keep their session when they confirm a new email address", async () => {
    const browser = new Jar()
    const signIn = await request(browser, "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password } })
    expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true })
    expect((await request(browser, "/api/auth/two-factor/verify-backup-code", { method: "POST", json: { code: device.backupCode() } })).status).toBe(200)
    const newEmail = `moved.${Date.now().toString(36)}@example.test`
    const since = Date.now()
    expect((await request(browser, "/api/auth/change-email", { method: "POST", json: { newEmail, callbackURL: "/konto?tab=profil" } })).status).toBe(200)
    // Confirm at the old address, then verify the new one, both in the signed-in browser.
    const confirm = await request(browser, linkIn(await waitForMail(user.email, /neue E-Mail/, 10_000, since)))
    expect(locationOf(confirm).pathname).toBe("/konto")
    const verify = await request(browser, linkIn(await waitForMail(newEmail, /./, 10_000, since)))
    expect(locationOf(verify).pathname).toBe("/konto")
    expect((await sessionOf(browser))?.user.id).toBe(user.id)
    const [row] = await sql`select email from "user" where id = ${user.id}`
    expect(row?.email).toBe(newEmail)
    user.email = newEmail
  })
})

describe("admins", () => {
  it("without 2FA are sent to /weiter after a Steam sign-in instead of the app", async () => {
    const steamId = String(76561198300000000n + BigInt(Date.now() % 1_000_000))
    const first = new Jar()
    await steamSignIn(first, steamId)
    const session = await sessionOf(first)
    await sql`update "user" set roles = '{admin}' where id = ${session!.user.id}`
    const { browser, oauthQuery } = await appFlow()
    const authorize = locationOf(await steamSignIn(browser, steamId, { oauth_query: oauthQuery }))
    expect(locationOf(await request(browser, authorize)).pathname).toBe("/weiter")
  })
})
