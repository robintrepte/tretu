import { createServer, type IncomingMessage, type Server } from "node:http"
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose"

/**
 * The HTTP side of Discord, Google, Apple and the Steam Web API for the integration tests. The app's server-side
 * fetches to those hosts are routed here by tests/support/intercept-fetch.mjs (a `--import` preload that only the
 * test harness loads), so Better Auth's real provider code runs end to end:
 *
 *   https://discord.com/api/oauth2/token          → /discord.com/api/oauth2/token
 *   https://appleid.apple.com/auth/keys           → /appleid.apple.com/auth/keys   (the JWKS Apple ID tokens verify against)
 *
 * Tests register what a code stands for with `POST /__mock/codes { code, provider, profile, forge? }`;
 * `forge: true` makes Apple's ID token signed by a key that is NOT in the JWKS.
 */

export const MOCK_CLIENTS = {
  discord: { id: "discord-test-client", secret: "discord-test-secret" },
  google: { id: "google-test-client.apps.googleusercontent.com", secret: "google-test-secret" },
  apple: { id: "de.tretu.auth.test", secret: "apple-test-client-secret-jwt" },
}

type Provider = "discord" | "google" | "apple"
interface Grant {
  provider: Provider
  profile: Record<string, unknown>
  forge?: boolean
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => resolve(body))
  })
}

export async function startProviderMock(port: number): Promise<Server> {
  const apple = await generateKeyPair("RS256", { extractable: true })
  const rogue = await generateKeyPair("RS256", { extractable: true })
  const google = await generateKeyPair("RS256", { extractable: true })
  const appleJwk = { ...(await exportJWK(apple.publicKey)), kid: "apple-test-key", alg: "RS256", use: "sig" }
  const codes = new Map<string, Grant>()
  const accessTokens = new Map<string, Grant>()
  const players = new Map<string, Record<string, string>>()
  const log: { host: string; path: string; method: string }[] = []

  const idToken = (key: CryptoKey, kid: string, issuer: string, audience: string, claims: Record<string, unknown>) =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime("10m").sign(key)

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock")
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(value))
    }
    const body = await readBody(req)

    if (url.pathname === "/__mock/codes" && req.method === "POST") {
      const input = JSON.parse(body) as Grant & { code: string }
      codes.set(input.code, { provider: input.provider, profile: input.profile, forge: input.forge })
      return json(200, { ok: true })
    }
    if (url.pathname === "/__mock/players" && req.method === "POST") {
      const input = JSON.parse(body) as Record<string, string>
      players.set(input.steamid!, input)
      return json(200, { ok: true })
    }
    if (url.pathname === "/__mock/log") return json(200, log)

    const [, host, ...rest] = url.pathname.split("/")
    const path = decodeURIComponent(`/${rest.join("/")}`)
    log.push({ host: host ?? "", path, method: req.method ?? "GET" })
    const form = new URLSearchParams(body)

    /** One-time authorization codes, as at the real providers. */
    const redeem = (provider: Provider) => {
      const code = form.get("code") ?? ""
      const grant = codes.get(code)
      if (!grant || grant.provider !== provider || form.get("grant_type") !== "authorization_code" || !form.get("redirect_uri")) return null
      codes.delete(code)
      return grant
    }

    if (host === "discord.com" && path === "/api/oauth2/token" && req.method === "POST") {
      const grant = redeem("discord")
      if (!grant) return json(400, { error: "invalid_grant" })
      const token = `discord-at-${Math.random().toString(36).slice(2)}`
      accessTokens.set(token, grant)
      return json(200, { access_token: token, token_type: "Bearer", expires_in: 604800, refresh_token: "discord-rt", scope: "identify email" })
    }
    if (host === "discord.com" && path === "/api/users/@me") {
      const grant = accessTokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""))
      if (!grant) return json(401, { message: "401: Unauthorized" })
      return json(200, { avatar: null, discriminator: "0", global_name: null, verified: true, ...grant.profile })
    }
    if (host === "oauth2.googleapis.com" && path === "/token" && req.method === "POST") {
      const grant = redeem("google")
      if (!grant) return json(400, { error: "invalid_grant" })
      const token = await idToken(google.privateKey, "google-test-key", "https://accounts.google.com", MOCK_CLIENTS.google.id, grant.profile)
      return json(200, { access_token: "google-at", id_token: token, expires_in: 3599, token_type: "Bearer", scope: "openid email profile" })
    }
    if (host === "appleid.apple.com" && path === "/auth/token" && req.method === "POST") {
      const grant = redeem("apple")
      if (!grant) return json(400, { error: "invalid_grant" })
      const key = grant.forge ? rogue.privateKey : apple.privateKey
      const token = await idToken(key, "apple-test-key", "https://appleid.apple.com", MOCK_CLIENTS.apple.id, grant.profile)
      return json(200, { access_token: "apple-at", id_token: token, expires_in: 3600, token_type: "Bearer", refresh_token: "apple-rt" })
    }
    if (host === "appleid.apple.com" && path === "/auth/keys") return json(200, { keys: [appleJwk] })
    if (host === "api.steampowered.com" && path === "/ISteamUser/GetPlayerSummaries/v2/") {
      if (!url.searchParams.get("key")) return json(403, {})
      const player = players.get(url.searchParams.get("steamids") ?? "")
      return json(200, { response: { players: player ? [player] : [] } })
    }
    json(404, { error: "not mocked", host, path })
  })
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()))
  return server
}
