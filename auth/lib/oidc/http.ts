/**
 * Two narrow adjustments around Better Auth's handler (app/api/auth/[...all]/route.ts), unit-tested in
 * tests/unit/http.test.ts:
 *
 * 1. Confidential clients are registered for `client_secret_basic`, and the oauth-provider plugin rejects any
 *    other method. Better Auth's genericOAuth sends `client_secret_post` by default and openid-client sends
 *    Basic, so token/revoke/introspect requests with the secret in the form body are rewritten to Basic.
 * 2. `__Host-` cookies must have `Path=/` and no `Domain`, or browsers drop them. One plugin cookie (the logout
 *    confirmation) is scoped to its endpoint path; it is widened to `/`.
 */

const CLIENT_AUTH_PATHS = ["/oauth2/token", "/oauth2/revoke", "/oauth2/introspect"]

/** RFC 6749 §2.3.1: client id and secret are form-urlencoded before Base64. */
function formEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+")
}

export function basicCredentials(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${formEncode(clientId)}:${formEncode(clientSecret)}`).toString("base64")}`
}

/** Returns the rewritten form body and Authorization header, or null when nothing needs to change. */
export function postToBasic(pathname: string, contentType: string | null, authorization: string | null, body: string): { body: string; authorization: string } | null {
  if (!CLIENT_AUTH_PATHS.some((p) => pathname.endsWith(p))) return null
  if (authorization) return null
  if (!contentType?.toLowerCase().startsWith("application/x-www-form-urlencoded")) return null
  const params = new URLSearchParams(body)
  const clientId = params.get("client_id")
  const clientSecret = params.get("client_secret")
  if (!clientId || !clientSecret || params.getAll("client_secret").length !== 1 || params.getAll("client_id").length !== 1) return null
  params.delete("client_id")
  params.delete("client_secret")
  return { body: params.toString(), authorization: basicCredentials(clientId, clientSecret) }
}

/** Forces `Path=/` and drops `Domain` on a `__Host-` Set-Cookie value; other cookies are returned unchanged. */
export function fixHostCookie(setCookie: string): string {
  if (!setCookie.trimStart().startsWith("__Host-")) return setCookie
  const [pair, ...attributes] = setCookie.split(";")
  const kept = attributes.map((a) => a.trim()).filter((a) => a && !/^(path|domain)=/i.test(a))
  if (!kept.some((a) => /^secure$/i.test(a))) kept.push("Secure")
  return [pair!.trim(), "Path=/", ...kept].join("; ")
}
