import { appSecrets } from "@/lib/tretu/apps"
import { verifySignedRequest, type VerifyResult } from "@/lib/tretu/signing"

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 })
export const apiError = (status: number, error: string, message?: string) => Response.json({ error, ...(message && { message }) }, { status })

/**
 * The forms of the signed `pathWithQuery` (contract §3: "exactly as sent") this server can recognise. Next.js hands
 * route handlers the query re-serialised like URLSearchParams does (space as `+`, `~ ' ( ) !` escaped), so a
 * caller that encoded with encodeURIComponent (space as `%20`) is matched by re-encoding the same parameters that
 * way. Both forms carry exactly the parameters the handler reads.
 */
export function signedPathCandidates(url: URL): string[] {
  const asGiven = url.pathname + url.search
  if (!url.search) return [asGiven]
  const reencoded = `${url.pathname}?${[...url.searchParams].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`
  return reencoded === asGiven ? [asGiven] : [asGiven, reencoded]
}

/** Reads the raw body and checks the §3 signature. Returns the calling app and the body, or a 401 response. */
export async function verifyAdminRequest(request: Request): Promise<{ app: string; body: string } | Response> {
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text()
  let result: VerifyResult = { ok: false, reason: "missing" }
  for (const pathWithQuery of signedPathCandidates(new URL(request.url))) {
    result = verifySignedRequest({ headers: request.headers, method: request.method, pathWithQuery, rawBody: body, secrets: appSecrets() })
    if (result.ok || result.reason !== "bad_signature") break
  }
  if (!result.ok) return unauthorized()
  return { app: result.app, body }
}

export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}
