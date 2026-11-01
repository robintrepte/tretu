import { auth } from "@/lib/auth"
import { fixHostCookie, postToBasic } from "@/lib/oidc/http"

async function normalizeRequest(request: Request): Promise<Request> {
  if (request.method !== "POST") return request
  const url = new URL(request.url)
  if (!url.pathname.includes("/oauth2/")) return request
  const body = await request.text()
  const rewritten = postToBasic(url.pathname, request.headers.get("content-type"), request.headers.get("authorization"), body)
  const headers = new Headers(request.headers)
  if (rewritten) headers.set("authorization", rewritten.authorization)
  headers.delete("content-length")
  return new Request(request.url, { method: request.method, headers, body: rewritten ? rewritten.body : body })
}

function fixCookies(response: Response): Response {
  const cookies = response.headers.getSetCookie()
  if (!cookies.some((c) => c.startsWith("__Host-"))) return response
  const headers = new Headers(response.headers)
  headers.delete("set-cookie")
  for (const cookie of cookies) headers.append("set-cookie", fixHostCookie(cookie))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function handler(request: Request) {
  return fixCookies(await auth.handler(await normalizeRequest(request)))
}

export const GET = handler
export const POST = handler
