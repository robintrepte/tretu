/**
 * Steam sign-in: OpenID 2.0 (Steam has no OAuth 2). Pure functions, unit-tested in tests/unit/steam-openid.test.ts.
 *
 * Flow: the browser is sent to Steam with `checkid_setup`; Steam sends it back to `return_to` with a positive
 * assertion. The assertion is only trusted after
 *  1. a strict check of every field (namespace, mode, `op_endpoint`, `claimed_id` = `identity` =
 *     `https://steamcommunity.com/openid/id/<17 digits>`, `return_to` exactly as sent, signed field list,
 *     a fresh `response_nonce`, no repeated parameters),
 *  2. direct verification with Steam (`check_authentication`, which must answer `is_valid:true`),
 *  3. the nonce being unused (the caller stores it for its validity window).
 */

export const OPENID_NS = "http://specs.openid.net/auth/2.0"
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select"
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/
/** Steam's nonces start with the UTC time they were issued, e.g. `2026-11-02T03:17:06Zr8A…`. */
const NONCE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)[\x21-\x7e]{0,255}$/
/** Fields a positive assertion must have signed (OpenID 2.0 §10.1). */
const REQUIRED_SIGNED = ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"] as const
/** The smallest individual-account SteamID64 (universe 1, type 1, instance 1, account 0). */
const STEAM_ID_BASE = 76561197960265728n

/** How old a `response_nonce` may be, and how far in the future (clock skew). */
export const NONCE_MAX_AGE_MS = 5 * 60_000
export const NONCE_MAX_SKEW_MS = 60_000

export type SteamAssertionError =
  | "cancelled"
  | "invalid_response"
  | "wrong_endpoint"
  | "wrong_return_to"
  | "invalid_identity"
  | "nonce_expired"
  | "not_verified"
  | "nonce_replayed"

export type SteamAssertionResult = { ok: true; steamId: string; nonce: string; nonceExpiresAt: Date } | { ok: false; error: SteamAssertionError }

/** The `checkid_setup` URL the browser is sent to. */
export function buildCheckidSetupUrl(endpoint: string, returnTo: string, realm: string): string {
  const url = new URL(endpoint)
  url.searchParams.set("openid.ns", OPENID_NS)
  url.searchParams.set("openid.mode", "checkid_setup")
  url.searchParams.set("openid.return_to", returnTo)
  url.searchParams.set("openid.realm", realm)
  url.searchParams.set("openid.identity", IDENTIFIER_SELECT)
  url.searchParams.set("openid.claimed_id", IDENTIFIER_SELECT)
  return url.toString()
}

/** The 64-bit SteamID of a claimed identifier, or null if it is not exactly Steam's format. */
export function steamIdFromClaimedId(claimedId: string | null | undefined): string | null {
  const match = claimedId ? CLAIMED_ID.exec(claimedId) : null
  if (!match) return null
  const id = match[1]!
  return BigInt(id) > STEAM_ID_BASE ? id : null
}

/** OpenID key-value form (`key:value` per line), as answered by `check_authentication`. */
export function parseKeyValue(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of body.split("\n")) {
    const index = line.indexOf(":")
    if (index <= 0) continue
    out.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
  }
  return out
}

/** The issue time of a Steam nonce, or null if it does not look like one. */
export function nonceTime(nonce: string): Date | null {
  const match = NONCE.exec(nonce)
  if (!match) return null
  const time = new Date(match[1]!)
  return Number.isNaN(time.getTime()) ? null : time
}

/** Only the `openid.*` parameters, each exactly once; null if any is repeated. */
export function openidParams(input: URLSearchParams): Map<string, string> | null {
  const out = new Map<string, string>()
  for (const [key, value] of input) {
    if (!key.startsWith("openid.")) continue
    if (out.has(key)) return null
    out.set(key, value)
  }
  return out
}

/** Step 1: everything that can be checked without asking Steam. */
export function checkAssertionFields(
  params: Map<string, string>,
  expected: { endpoint: string; returnTo: string; now?: Date },
): { ok: true; steamId: string; nonce: string; nonceExpiresAt: Date } | { ok: false; error: SteamAssertionError } {
  const get = (name: string) => params.get(`openid.${name}`)
  if (get("ns") !== OPENID_NS) return { ok: false, error: "invalid_response" }
  const mode = get("mode")
  if (mode === "cancel") return { ok: false, error: "cancelled" }
  if (mode !== "id_res") return { ok: false, error: "invalid_response" }
  if (get("op_endpoint") !== expected.endpoint) return { ok: false, error: "wrong_endpoint" }
  if (get("return_to") !== expected.returnTo) return { ok: false, error: "wrong_return_to" }
  const claimedId = get("claimed_id")
  if (!claimedId || claimedId !== get("identity")) return { ok: false, error: "invalid_identity" }
  const steamId = steamIdFromClaimedId(claimedId)
  if (!steamId) return { ok: false, error: "invalid_identity" }
  if (!get("assoc_handle") || !get("sig")) return { ok: false, error: "invalid_response" }
  const signed = new Set((get("signed") ?? "").split(","))
  if (REQUIRED_SIGNED.some((field) => !signed.has(field))) return { ok: false, error: "invalid_response" }
  // Every signed field must be present (a signature over a missing field would verify an empty value).
  for (const field of signed) if (!field || !params.has(`openid.${field}`)) return { ok: false, error: "invalid_response" }
  const nonce = get("response_nonce") ?? ""
  const issued = nonceTime(nonce)
  if (!issued) return { ok: false, error: "invalid_response" }
  const now = (expected.now ?? new Date()).getTime()
  if (issued.getTime() < now - NONCE_MAX_AGE_MS || issued.getTime() > now + NONCE_MAX_SKEW_MS) return { ok: false, error: "nonce_expired" }
  return { ok: true, steamId, nonce, nonceExpiresAt: new Date(issued.getTime() + NONCE_MAX_AGE_MS + NONCE_MAX_SKEW_MS) }
}

/** Step 2: ask Steam whether it really issued this assertion. Any failure counts as "not verified". */
export async function checkAuthentication(
  endpoint: string,
  params: Map<string, string>,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  const body = new URLSearchParams()
  for (const [key, value] of params) body.set(key, value)
  body.set("openid.mode", "check_authentication")
  try {
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/plain" },
      body: body.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    })
    if (response.status !== 200) return false
    const answer = parseKeyValue((await response.text()).slice(0, 4096))
    return answer.get("ns") === OPENID_NS && answer.get("is_valid") === "true"
  } catch {
    return false
  }
}

/**
 * The whole verification. `consumeNonce` stores the nonce until `expiresAt` and returns false if it was
 * already used; it is called last, so only assertions Steam confirmed are recorded.
 */
export async function verifySteamAssertion(
  query: URLSearchParams,
  options: {
    endpoint: string
    returnTo: string
    now?: Date
    fetch?: typeof fetch
    consumeNonce: (nonce: string, expiresAt: Date) => Promise<boolean>
  },
): Promise<SteamAssertionResult> {
  const params = openidParams(query)
  if (!params) return { ok: false, error: "invalid_response" }
  const fields = checkAssertionFields(params, options)
  if (!fields.ok) return fields
  if (!(await checkAuthentication(options.endpoint, params, { fetch: options.fetch }))) return { ok: false, error: "not_verified" }
  if (!(await options.consumeNonce(`${options.endpoint}#${fields.nonce}`, fields.nonceExpiresAt))) return { ok: false, error: "nonce_replayed" }
  return fields
}
