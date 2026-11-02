import { readdir, readFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { base32 } from "@better-auth/utils/base32"
import { createOTP } from "@better-auth/utils/otp"
import * as oidc from "openid-client"
import { ISSUER, OUTBOX_DIR, PROVIDER_MOCK, STEAM_STUB } from "./env"

/** A minimal cookie jar: enough to act like one browser against the app. */
export class Jar {
  readonly cookies = new Map<string, string>()
  update(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(";")
      const index = pair!.indexOf("=")
      const name = pair!.slice(0, index).trim()
      const value = pair!.slice(index + 1).trim()
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === ""
      if (expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }
  has(fragment: string) {
    return [...this.cookies.keys()].some((k) => k.includes(fragment))
  }
}

/**
 * Like a browser: no redirects followed, the jar's cookies sent. Node's fetch always claims
 * `sec-fetch-mode: cors`, so requests go through node:http: GETs look like page navigations, JSON posts like
 * the auth client's fetch calls.
 */
export async function request(
  jar: Jar,
  url: string | URL,
  init: { method?: string; json?: unknown; form?: Record<string, string>; headers?: Record<string, string>; withoutCookies?: boolean } = {},
): Promise<Response> {
  const target = new URL(url, ISSUER)
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.form ? new URLSearchParams(init.form).toString() : undefined
  const headers: Record<string, string> = {
    accept: init.json !== undefined ? "application/json" : "text/html",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) integration-test",
    "sec-fetch-mode": init.json !== undefined ? "cors" : "navigate",
    ...init.headers,
  }
  // A cross-site form POST (Apple's form_post) arrives without the SameSite=Lax cookies.
  const cookie = init.withoutCookies ? "" : jar.header()
  if (cookie) headers.cookie = cookie
  if (body) {
    headers["content-type"] = init.form ? "application/x-www-form-urlencoded" : "application/json"
    headers.origin ??= ISSUER
    if (init.headers?.origin) headers.origin = init.headers.origin
    headers["content-length"] = String(Buffer.byteLength(body))
  }
  const response = await new Promise<Response>((resolve, reject) => {
    const req = http.request(target, { method: init.method ?? "GET", headers }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (c: Buffer) => chunks.push(c))
      res.on("end", () => {
        const out = new Headers()
        for (const [key, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) for (const v of value) out.append(key, v)
          else if (value !== undefined) out.set(key, value)
        }
        const status = res.statusCode ?? 0
        const payload = status === 204 || status === 304 ? null : Buffer.concat(chunks)
        resolve(new Response(payload, { status, headers: out }))
      })
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
  jar.update(response)
  return response
}

export interface StoredMail {
  to: string
  subject: string
  text: string
  html: string
}

/** Waits for the newest email to `to` in the test outbox (MAIL_OUTBOX_DIR). */
export async function waitForMail(to: string, match: RegExp = /./, timeoutMs = 10_000, since = 0): Promise<StoredMail> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    let files: string[] = []
    try {
      files = (await readdir(OUTBOX_DIR)).sort().reverse()
    } catch {
      // not created yet
    }
    for (const file of files) {
      if (Number(file.split("-")[0]) < since) continue
      const mail = JSON.parse(await readFile(path.join(OUTBOX_DIR, file), "utf8")) as StoredMail
      if (mail.to.toLowerCase() === to.toLowerCase() && match.test(mail.subject)) return mail
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no mail to ${to}`)
}

export function linkIn(mail: StoredMail): string {
  const url = mail.text.match(/https?:\/\/\S+/)?.[0]
  if (!url) throw new Error("no link in mail")
  return url
}

let counter = 0
export function uniqueUser(prefix = "tester") {
  counter += 1
  const id = `${Date.now().toString(36)}${counter}`
  return { username: `${prefix}_${id}`.slice(0, 24), email: `${prefix}.${id}@example.test`.toLowerCase(), password: "correct horse battery staple 42", name: `Test ${id}` }
}

/** Registers a user through the API and confirms the email by following the link from the outbox. */
export async function registerVerifiedUser(prefix?: string) {
  const user = uniqueUser(prefix)
  const jar = new Jar()
  const signUp = await request(jar, "/api/auth/sign-up/email", { method: "POST", json: { ...user, callbackURL: "/konto" } })
  if (!signUp.ok) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`)
  const mail = await waitForMail(user.email)
  const verify = await request(jar, linkIn(mail))
  if (verify.status !== 302) throw new Error(`verify failed: ${verify.status}`)
  const session = await request(jar, "/api/auth/get-session")
  const body = (await session.json()) as { user: { id: string } } | null
  if (!body) throw new Error("no session after verification")
  return { ...user, id: body.user.id, jar }
}

/** Where a redirect response points (absolute, resolved against the issuer). */
export function locationOf(response: Response): URL {
  const location = response.headers.get("location")
  if (!location) throw new Error(`expected a redirect, got ${response.status}`)
  return new URL(location, ISSUER)
}

/* ───────────── OIDC client side (the "app") ───────────── */

export const SCOPES = "openid profile email offline_access tretu"
export const SAGA_REDIRECT = "http://localhost:3038/api/auth/oauth2/callback/tretu"

export async function discover(clientId: string, auth: oidc.ClientAuth) {
  return oidc.discovery(new URL(ISSUER), clientId, undefined, auth, { execute: [oidc.allowInsecureRequests] })
}

export function startAuthorization(config: oidc.Configuration, redirectUri: string, extra: Record<string, string> = {}) {
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

/** Starts an app sign-in in `jar` and returns the signed request the login page carries (`oauth_query`). */
export async function loginPageQuery(jar: Jar, authorizeUrl: URL): Promise<string> {
  const res = await request(jar, authorizeUrl)
  const login = locationOf(res)
  if (login.pathname !== "/login") throw new Error(`expected the login page, got ${login.pathname}`)
  return login.search.slice(1)
}

/* ───────────── Two-factor ───────────── */

/** Turns on TOTP for a signed-in user (enable + first code) and returns a code generator. */
export async function enableTwoFactor(jar: Jar, password?: string): Promise<{ code: () => Promise<string>; backupCodes: string[] }> {
  const enable = await request(jar, "/api/auth/two-factor/enable", { method: "POST", json: password ? { password } : {} })
  if (!enable.ok) throw new Error(`2fa enable failed: ${enable.status} ${await enable.text()}`)
  const { totpURI, backupCodes } = (await enable.json()) as { totpURI: string; backupCodes: string[] }
  const secret = new TextDecoder().decode(base32.decode(new URL(totpURI).searchParams.get("secret")!))
  const code = () => createOTP(secret, { digits: 6 }).totp()
  const verify = await request(jar, "/api/auth/two-factor/verify-totp", { method: "POST", json: { code: await code() } })
  if (!verify.ok) throw new Error(`2fa verify failed: ${verify.status} ${await verify.text()}`)
  return { code, backupCodes }
}

/* ───────────── Provider mock and Steam stub ───────────── */

export async function mockProviderCode(provider: "discord" | "google" | "apple", code: string, profile: Record<string, unknown>, options: { forge?: boolean } = {}) {
  const res = await fetch(`${PROVIDER_MOCK}/__mock/codes`, { method: "POST", body: JSON.stringify({ provider, code, profile, ...options }) })
  if (!res.ok) throw new Error("mock not reachable")
}

export async function mockSteamPlayer(steamid: string, personaname: string, avatarfull = `https://avatars.steamstatic.com/${steamid}_full.jpg`) {
  await fetch(`${PROVIDER_MOCK}/__mock/players`, { method: "POST", body: JSON.stringify({ steamid, personaname, avatarfull }) })
}

export async function steamNext(identity: { steamId: string } | { cancel: true }) {
  await fetch(`${STEAM_STUB}/__stub/next`, { method: "POST", body: JSON.stringify(identity) })
}

export async function steamAssertion(returnTo: string, steamId: string, options: { nonce?: string; opEndpoint?: string } = {}): Promise<URLSearchParams> {
  const res = await fetch(`${STEAM_STUB}/__stub/assertion`, { method: "POST", body: JSON.stringify({ returnTo, steamId, ...options }) })
  return new URLSearchParams(await res.text())
}

/**
 * A provider sign-in in `jar`, up to the provider's authorization page: returns the `state` Better Auth put in
 * the provider URL (and the URL itself).
 */
export async function startSocial(jar: Jar, provider: "discord" | "google" | "apple", body: Record<string, unknown> = {}) {
  const res = await request(jar, "/api/auth/sign-in/social", { method: "POST", json: { provider, callbackURL: "/konto", errorCallbackURL: "/login", ...body } })
  if (!res.ok) throw new Error(`sign-in/social failed: ${res.status} ${await res.text()}`)
  const { url } = (await res.json()) as { url: string }
  const providerUrl = new URL(url)
  return { providerUrl, state: providerUrl.searchParams.get("state")! }
}

/** The provider redirects back with a code: GET callback (Apple: cross-site form POST, then Better Auth's GET). */
export async function finishSocial(jar: Jar, provider: "discord" | "google" | "apple", state: string, code: string, extra: Record<string, string> = {}): Promise<Response> {
  if (provider === "apple") {
    const post = await request(jar, `/api/auth/callback/apple`, { method: "POST", form: { code, state, ...extra }, withoutCookies: true, headers: { origin: "https://appleid.apple.com" } })
    if (post.status !== 302) throw new Error(`apple form_post: ${post.status} ${await post.text()}`)
    return request(jar, locationOf(post))
  }
  return request(jar, `/api/auth/callback/${provider}?${new URLSearchParams({ code, state, ...extra })}`)
}

/** "Mit Steam anmelden" in `jar`: start, let the stub answer as Steam, return the callback's response. */
export async function steamSignIn(jar: Jar, steamId: string, body: Record<string, unknown> = {}, path = "/api/auth/sign-in/steam"): Promise<Response> {
  const start = await request(jar, path, { method: "POST", json: { callbackURL: "/konto", errorCallbackURL: "/login", ...body } })
  if (!start.ok) throw new Error(`steam start failed: ${start.status} ${await start.text()}`)
  const { url } = (await start.json()) as { url: string }
  await steamNext({ steamId })
  const atSteam = await fetch(url, { redirect: "manual" })
  return request(jar, locationOf(atSteam))
}

export async function sessionOf(jar: Jar): Promise<{ user: { id: string; twoFactorEnabled?: boolean } } | null> {
  return (await (await request(jar, "/api/auth/get-session")).json()) as { user: { id: string } } | null
}
