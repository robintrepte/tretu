import { afterEach, describe, expect, it } from "vitest"
import { allowedOrigins, corsHeaders, isCorsPath, preflight, withCors } from "@/lib/oidc/cors"

const clients = JSON.stringify({
  saga: { type: "confidential", secret: "0123456789abcdef0123", redirectUris: ["https://saga.tretu.de/api/auth/oauth2/callback/tretu"] },
  hollowmere: { type: "public", redirectUris: ["https://hollowmere.tretu.de/auth/callback", "http://127.0.0.1/callback"] },
})

describe("OIDC CORS", () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it("allows only https origins of public clients by default", () => {
    process.env.TRETU_OAUTH_CLIENTS_JSON = clients
    delete process.env.TRETU_CORS_ORIGINS
    expect([...allowedOrigins()]).toEqual(["https://hollowmere.tretu.de"])
  })

  it("covers token, userinfo, revoke and jwks only", () => {
    expect(isCorsPath("/api/auth/oauth2/token")).toBe(true)
    expect(isCorsPath("/api/auth/oauth2/userinfo")).toBe(true)
    expect(isCorsPath("/api/auth/oauth2/revoke")).toBe(true)
    expect(isCorsPath("/api/auth/jwks")).toBe(true)
    expect(isCorsPath("/api/auth/oauth2/authorize")).toBe(false)
    expect(isCorsPath("/api/auth/sign-in/email")).toBe(false)
  })

  it("adds headers for an allowed origin and never for others", () => {
    process.env.TRETU_OAUTH_CLIENTS_JSON = clients
    const ok = new Request("https://auth.tretu.de/api/auth/oauth2/token", { method: "POST", headers: { origin: "https://hollowmere.tretu.de" } })
    const headers = corsHeaders(ok)
    expect(headers?.get("access-control-allow-origin")).toBe("https://hollowmere.tretu.de")
    expect(headers?.get("access-control-allow-credentials")).toBeNull()
    const evil = new Request("https://auth.tretu.de/api/auth/oauth2/token", { method: "POST", headers: { origin: "https://evil.example" } })
    expect(corsHeaders(evil)).toBeNull()
    expect(withCors(evil, new Response("x")).headers.get("access-control-allow-origin")).toBeNull()
    const login = new Request("https://auth.tretu.de/api/auth/sign-in/email", { method: "POST", headers: { origin: "https://hollowmere.tretu.de" } })
    expect(corsHeaders(login)).toBeNull()
  })

  it("answers preflights", () => {
    process.env.TRETU_CORS_ORIGINS = "https://hollowmere.tretu.de"
    const res = preflight(new Request("https://auth.tretu.de/api/auth/oauth2/userinfo", { method: "OPTIONS", headers: { origin: "https://hollowmere.tretu.de" } }))
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization")
  })
})
