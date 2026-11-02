import { describe, expect, it, vi } from "vitest"
import {
  buildCheckidSetupUrl,
  checkAuthentication,
  nonceTime,
  OPENID_NS,
  parseKeyValue,
  steamIdFromClaimedId,
  verifySteamAssertion,
} from "@/lib/steam/openid"
import { fetchSteamProfile } from "@/lib/steam/profile"

const ENDPOINT = "https://steamcommunity.com/openid/login"
const RETURN_TO = "https://auth.tretu.de/api/auth/steam/callback?state=abc123"
const STEAM_ID = "76561197960287930"
const NOW = new Date("2026-11-02T12:00:00Z")

/** A positive assertion as Steam sends it back to return_to. */
function assertion(overrides: Record<string, string | null> = {}): URLSearchParams {
  const fields: Record<string, string> = {
    "openid.ns": OPENID_NS,
    "openid.mode": "id_res",
    "openid.op_endpoint": ENDPOINT,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.return_to": RETURN_TO,
    "openid.response_nonce": "2026-11-02T11:59:30ZaBcD1234efgh",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2lnbmF0dXJl",
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete fields[key]
    else fields[key] = value
  }
  const params = new URLSearchParams({ state: "abc123" })
  for (const [key, value] of Object.entries(fields)) params.set(key, value)
  return params
}

/** check_authentication stub: answers like Steam and records what it was asked. */
function steamAnswer(body: string, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status }))
}
const VALID = `ns:${OPENID_NS}\nis_valid:true\n`

async function verify(query: URLSearchParams, options: { fetch?: typeof fetch; used?: Set<string>; returnTo?: string; endpoint?: string } = {}) {
  const used = options.used ?? new Set<string>()
  return verifySteamAssertion(query, {
    endpoint: options.endpoint ?? ENDPOINT,
    returnTo: options.returnTo ?? RETURN_TO,
    now: NOW,
    fetch: options.fetch ?? (steamAnswer(VALID) as unknown as typeof fetch),
    consumeNonce: async (nonce) => {
      if (used.has(nonce)) return false
      used.add(nonce)
      return true
    },
  })
}

describe("Steam OpenID: request", () => {
  it("builds the checkid_setup redirect with realm and return_to", () => {
    const url = new URL(buildCheckidSetupUrl(ENDPOINT, RETURN_TO, "https://auth.tretu.de/"))
    expect(url.origin + url.pathname).toBe(ENDPOINT)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      "openid.ns": OPENID_NS,
      "openid.mode": "checkid_setup",
      "openid.return_to": RETURN_TO,
      "openid.realm": "https://auth.tretu.de/",
      "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    })
  })
})

describe("Steam OpenID: verification", () => {
  it("accepts a genuine assertion and returns the SteamID64", async () => {
    const fetchMock = steamAnswer(VALID)
    const result = await verify(assertion(), { fetch: fetchMock as unknown as typeof fetch })
    expect(result).toMatchObject({ ok: true, steamId: STEAM_ID })
    // check_authentication: the same fields back to Steam, mode switched, as a form POST.
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(ENDPOINT)
    expect(init?.method).toBe("POST")
    const sent = new URLSearchParams(init?.body as string)
    expect(sent.get("openid.mode")).toBe("check_authentication")
    expect(sent.get("openid.sig")).toBe("c2lnbmF0dXJl")
    expect(sent.get("openid.return_to")).toBe(RETURN_TO)
    expect(sent.has("state")).toBe(false)
  })

  it("rejects a forged assertion that Steam does not confirm", async () => {
    expect(await verify(assertion(), { fetch: steamAnswer(`ns:${OPENID_NS}\nis_valid:false\n`) as unknown as typeof fetch })).toEqual({ ok: false, error: "not_verified" })
    expect(await verify(assertion(), { fetch: steamAnswer("is_valid:true\n") as unknown as typeof fetch })).toEqual({ ok: false, error: "not_verified" })
    expect(await verify(assertion(), { fetch: steamAnswer(VALID, 500) as unknown as typeof fetch })).toEqual({ ok: false, error: "not_verified" })
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    expect(await verify(assertion(), { fetch: down as unknown as typeof fetch })).toEqual({ ok: false, error: "not_verified" })
  })

  it("rejects tampered identities before asking Steam", async () => {
    const fetchMock = steamAnswer(VALID)
    const f = fetchMock as unknown as typeof fetch
    const other = "https://steamcommunity.com/openid/id/76561197960287931"
    expect(await verify(assertion({ "openid.claimed_id": other }), { fetch: f })).toEqual({ ok: false, error: "invalid_identity" })
    expect(await verify(assertion({ "openid.claimed_id": other, "openid.identity": other.replace("steamcommunity.com", "evil.example") }), { fetch: f })).toEqual({ ok: false, error: "invalid_identity" })
    for (const bad of [
      "https://evil.example/openid/id/76561197960287930",
      "http://steamcommunity.com/openid/id/76561197960287930",
      "https://steamcommunity.com/openid/id/7656119796028793",
      "https://steamcommunity.com/openid/id/765611979602879301",
      "https://steamcommunity.com/openid/id/76561197960287930/",
      "https://steamcommunity.com/openid/id/00000000000000001",
    ]) {
      expect(await verify(assertion({ "openid.claimed_id": bad, "openid.identity": bad }), { fetch: f })).toEqual({ ok: false, error: "invalid_identity" })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a wrong op_endpoint (assertion from another OpenID provider)", async () => {
    expect(await verify(assertion({ "openid.op_endpoint": "https://evil.example/openid/login" }))).toEqual({ ok: false, error: "wrong_endpoint" })
    expect(await verify(assertion(), { endpoint: "http://127.0.0.1:9/openid/login" })).toEqual({ ok: false, error: "wrong_endpoint" })
  })

  it("rejects a return_to that is not the one sent (other state, other host)", async () => {
    expect(await verify(assertion({ "openid.return_to": "https://auth.tretu.de/api/auth/steam/callback?state=other" }))).toEqual({ ok: false, error: "wrong_return_to" })
    expect(await verify(assertion({ "openid.return_to": "https://evil.example/api/auth/steam/callback?state=abc123" }))).toEqual({ ok: false, error: "wrong_return_to" })
    expect(await verify(assertion(), { returnTo: "https://auth.tretu.de/api/auth/steam/callback?state=xyz" })).toEqual({ ok: false, error: "wrong_return_to" })
  })

  it("rejects a replayed assertion (same nonce twice)", async () => {
    const used = new Set<string>()
    expect(await verify(assertion(), { used })).toMatchObject({ ok: true })
    expect(await verify(assertion(), { used })).toEqual({ ok: false, error: "nonce_replayed" })
  })

  it("rejects old and future nonces and malformed ones", async () => {
    expect(await verify(assertion({ "openid.response_nonce": "2026-11-02T11:50:00Zold" }))).toEqual({ ok: false, error: "nonce_expired" })
    expect(await verify(assertion({ "openid.response_nonce": "2026-11-02T12:05:00Zfuture" }))).toEqual({ ok: false, error: "nonce_expired" })
    expect(await verify(assertion({ "openid.response_nonce": "yesterday" }))).toEqual({ ok: false, error: "invalid_response" })
    expect(await verify(assertion({ "openid.response_nonce": null }))).toEqual({ ok: false, error: "invalid_response" })
  })

  it("rejects incomplete or unsigned assertions and parameter pollution", async () => {
    expect(await verify(assertion({ "openid.mode": "cancel" }))).toEqual({ ok: false, error: "cancelled" })
    expect(await verify(assertion({ "openid.mode": "checkid_setup" }))).toEqual({ ok: false, error: "invalid_response" })
    expect(await verify(assertion({ "openid.ns": "http://openid.net/signon/1.1" }))).toEqual({ ok: false, error: "invalid_response" })
    expect(await verify(assertion({ "openid.sig": null }))).toEqual({ ok: false, error: "invalid_response" })
    expect(await verify(assertion({ "openid.assoc_handle": null }))).toEqual({ ok: false, error: "invalid_response" })
    // claimed_id not covered by the signature
    expect(await verify(assertion({ "openid.signed": "signed,op_endpoint,identity,return_to,response_nonce,assoc_handle" }))).toEqual({ ok: false, error: "invalid_response" })
    // a signed field that is missing
    expect(await verify(assertion({ "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle,invalidate_handle" }))).toEqual({ ok: false, error: "invalid_response" })
    const doubled = assertion()
    doubled.append("openid.claimed_id", "https://steamcommunity.com/openid/id/76561197960287931")
    expect(await verify(doubled)).toEqual({ ok: false, error: "invalid_response" })
  })
})

describe("Steam OpenID: helpers", () => {
  it("parses SteamIDs, nonces and key-value answers", () => {
    expect(steamIdFromClaimedId(`https://steamcommunity.com/openid/id/${STEAM_ID}`)).toBe(STEAM_ID)
    expect(steamIdFromClaimedId(null)).toBeNull()
    expect(nonceTime("2026-11-02T11:59:30ZaBcD")?.toISOString()).toBe("2026-11-02T11:59:30.000Z")
    expect(nonceTime("2026-13-45T99:99:99Zx")).toBeNull()
    expect(Object.fromEntries(parseKeyValue("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"))).toEqual({ ns: OPENID_NS, is_valid: "true" })
  })

  it("check_authentication never follows redirects and times out", async () => {
    const fetchMock = steamAnswer(VALID)
    await checkAuthentication(ENDPOINT, new Map([["openid.ns", OPENID_NS]]), { fetch: fetchMock as unknown as typeof fetch })
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: "manual" })
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it("reads persona name and avatar from the Web API, and nothing without a key", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) =>
      Response.json({ response: { players: [{ steamid: STEAM_ID, personaname: " Gabe ", avatarfull: "https://avatars.steamstatic.com/abc_full.jpg" }] } }),
    )
    expect(await fetchSteamProfile(STEAM_ID, "key", fetchMock as unknown as typeof fetch)).toEqual({ personaName: "Gabe", avatar: "https://avatars.steamstatic.com/abc_full.jpg" })
    expect(String(fetchMock.mock.calls[0]![0])).toContain(`steamids=${STEAM_ID}`)
    expect(await fetchSteamProfile(STEAM_ID, undefined, fetchMock as unknown as typeof fetch)).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    const evil = vi.fn(async () => Response.json({ response: { players: [{ steamid: STEAM_ID, personaname: "x", avatarfull: "http://evil.example/a.jpg" }] } }))
    expect(await fetchSteamProfile(STEAM_ID, "key", evil as unknown as typeof fetch)).toEqual({ personaName: "x", avatar: null })
    const failing = vi.fn(async () => new Response("nope", { status: 403 }))
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await fetchSteamProfile(STEAM_ID, "key", failing as unknown as typeof fetch)).toBeNull()
  })
})
