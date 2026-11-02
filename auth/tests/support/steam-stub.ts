import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { createServer, type Server } from "node:http"

/**
 * A local stand-in for Steam's OpenID 2.0 provider (https://steamcommunity.com/openid/login), for the
 * integration and browser tests (the app points at it with STEAM_OPENID_ENDPOINT, refused in production).
 *
 * - GET  checkid_setup        → "the user signs in at Steam": 302 back to return_to with a signed positive assertion
 *                               for the identity chosen with `next()` (or `openid.mode=cancel`);
 * - POST check_authentication → `is_valid:true` only for an assertion this stub signed, unchanged.
 * Like Steam it does not remember nonces: replay protection is the app's job.
 */

const NS = "http://specs.openid.net/auth/2.0"
const SIGNED = "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle"

export interface SteamStub {
  endpoint: string
  /** The identity the next checkid_setup answers with. */
  next(identity: { steamId: string } | { cancel: true }): void
  /** A signed assertion for `returnTo`, as Steam would send it (options to build broken ones). */
  assertion(returnTo: string, steamId: string, options?: { nonce?: string; opEndpoint?: string }): URLSearchParams
  checkCalls: number
  close(): Promise<void>
}

function keyValue(params: URLSearchParams, fields: string[]): string {
  return fields.map((f) => `${f}:${params.get(`openid.${f}`) ?? ""}\n`).join("")
}

export async function startSteamStub(port: number, host = "127.0.0.1"): Promise<SteamStub> {
  const endpoint = `http://${host}:${port}/openid/login`
  const secret = randomBytes(32)
  let nextIdentity: { steamId: string } | { cancel: true } = { steamId: "76561198000000001" }
  const sign = (params: URLSearchParams) => createHmac("sha256", secret).update(keyValue(params, SIGNED.split(","))).digest("base64")

  const stub: SteamStub = {
    endpoint,
    checkCalls: 0,
    next(identity) {
      nextIdentity = identity
    },
    assertion(returnTo, steamId, options = {}) {
      const claimed = `https://steamcommunity.com/openid/id/${steamId}`
      const params = new URLSearchParams({
        "openid.ns": NS,
        "openid.mode": "id_res",
        "openid.op_endpoint": options.opEndpoint ?? endpoint,
        "openid.claimed_id": claimed,
        "openid.identity": claimed,
        "openid.return_to": returnTo,
        "openid.response_nonce": options.nonce ?? `${new Date().toISOString().slice(0, 19)}Z${randomBytes(6).toString("hex")}`,
        "openid.assoc_handle": "stub-handle",
        "openid.signed": SIGNED,
      })
      params.set("openid.sig", sign(params))
      return params
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", endpoint)
    // Control endpoints for tests running in another process (vitest workers).
    if (req.method === "POST" && url.pathname.startsWith("/__stub/")) {
      let raw = ""
      req.on("data", (c) => (raw += c))
      req.on("end", () => {
        const input = raw ? (JSON.parse(raw) as Record<string, string>) : {}
        if (url.pathname === "/__stub/next") {
          stub.next(input.cancel ? { cancel: true } : { steamId: input.steamId! })
          res.writeHead(204).end()
        } else if (url.pathname === "/__stub/assertion") {
          const params = stub.assertion(input.returnTo!, input.steamId!, { nonce: input.nonce, opEndpoint: input.opEndpoint })
          res.writeHead(200, { "content-type": "text/plain" }).end(params.toString())
        } else res.writeHead(404).end()
      })
      return
    }
    if (url.pathname !== "/openid/login") {
      res.writeHead(404).end()
      return
    }
    if (req.method === "GET") {
      const q = url.searchParams
      const returnTo = q.get("openid.return_to")
      if (q.get("openid.mode") !== "checkid_setup" || q.get("openid.ns") !== NS || !returnTo || !q.get("openid.realm") || !returnTo.startsWith(q.get("openid.realm")!)) {
        res.writeHead(400, { "content-type": "text/plain" }).end("bad checkid_setup")
        return
      }
      const answer = "cancel" in nextIdentity ? new URLSearchParams({ "openid.ns": NS, "openid.mode": "cancel" }) : stub.assertion(returnTo, nextIdentity.steamId)
      const target = new URL(returnTo)
      for (const [k, v] of answer) target.searchParams.append(k, v)
      res.writeHead(302, { location: target.toString() }).end()
      return
    }
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      stub.checkCalls++
      const params = new URLSearchParams(body)
      let valid = false
      if (params.get("openid.mode") === "check_authentication" && params.get("openid.signed") === SIGNED) {
        const expected = Buffer.from(sign(params))
        const given = Buffer.from(params.get("openid.sig") ?? "")
        valid = expected.length === given.length && timingSafeEqual(expected, given)
      }
      res.writeHead(200, { "content-type": "text/plain" }).end(`ns:${NS}\nis_valid:${valid}\n`)
    })
  })
  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()))
  return stub
}
