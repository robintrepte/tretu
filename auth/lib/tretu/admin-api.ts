import { appSecrets } from "@/lib/tretu/apps"
import { verifySignedRequest } from "@/lib/tretu/signing"

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 })
export const apiError = (status: number, error: string, message?: string) => Response.json({ error, ...(message && { message }) }, { status })

/** Reads the raw body and checks the §3 signature. Returns the calling app and the body, or a 401 response. */
export async function verifyAdminRequest(request: Request): Promise<{ app: string; body: string } | Response> {
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text()
  const url = new URL(request.url)
  const result = verifySignedRequest({
    headers: request.headers,
    method: request.method,
    pathWithQuery: url.pathname + url.search,
    rawBody: body,
    secrets: appSecrets(),
  })
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
