import { parseClientsJson } from "@/lib/oidc/clients"

/**
 * CORS for the OIDC endpoints a browser-based public client calls directly (Hollowmere's web build
 * exchanges its code in the browser). Only the token, userinfo, revocation and JWKS endpoints get
 * CORS, only for allowed origins, and never with credentials: these calls carry no cookies.
 *
 * Allowed origins: TRETU_CORS_ORIGINS (comma-separated) if set, otherwise the https origins of every
 * public client's redirect URIs from TRETU_OAUTH_CLIENTS_JSON.
 */

const CORS_PATHS = [/\/oauth2\/token$/, /\/oauth2\/userinfo$/, /\/oauth2\/revoke$/, /\/jwks$/]

export function isCorsPath(pathname: string): boolean {
  return CORS_PATHS.some((pattern) => pattern.test(pathname))
}

let cached: { key: string; origins: Set<string> } | null = null

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const key = `${env.TRETU_CORS_ORIGINS ?? ""}|${env.TRETU_OAUTH_CLIENTS_JSON ?? ""}`
  if (cached?.key === key) return cached.origins
  const origins = new Set<string>()
  if (env.TRETU_CORS_ORIGINS?.trim()) {
    for (const value of env.TRETU_CORS_ORIGINS.split(",")) {
      const trimmed = value.trim()
      if (trimmed) origins.add(new URL(trimmed).origin)
    }
  } else {
    try {
      for (const client of parseClientsJson(env.TRETU_OAUTH_CLIENTS_JSON)) {
        if (client.type !== "public") continue
        for (const uri of client.redirectUris) {
          const url = new URL(uri)
          if (url.protocol === "https:") origins.add(url.origin)
        }
      }
    } catch {
      // An invalid client config is reported at boot by clients:sync; no CORS until it is fixed.
    }
  }
  cached = { key, origins }
  return origins
}

export function corsHeaders(request: Request): Headers | null {
  const origin = request.headers.get("origin")
  if (!origin) return null
  const pathname = new URL(request.url).pathname
  if (!isCorsPath(pathname) || !allowedOrigins().has(origin)) return null
  const headers = new Headers()
  headers.set("access-control-allow-origin", origin)
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS")
  headers.set("access-control-allow-headers", "authorization, content-type")
  headers.set("access-control-max-age", "600")
  headers.set("vary", "Origin")
  return headers
}

export function withCors(request: Request, response: Response): Response {
  const cors = corsHeaders(request)
  if (!cors) return response
  const headers = new Headers(response.headers)
  cors.forEach((value, name) => headers.set(name, value))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/** Preflight answer: 204 with CORS headers for allowed origins, plain 204 otherwise. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) ?? undefined })
}
