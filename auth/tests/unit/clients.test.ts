import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { hashClientSecret, parseClientsJson, postLogoutUris, toClientRow } from "@/lib/oidc/clients"

const valid = {
  saga: { type: "confidential", secret: "x".repeat(32), redirectUris: ["https://saga.tretu.de/api/auth/oauth2/callback/tretu"] },
  hollowmere: { type: "public", redirectUris: ["https://hollowmere.tretu.de/auth/callback", "http://127.0.0.1/callback"] },
}

describe("TRETU_OAUTH_CLIENTS_JSON", () => {
  it("parses the documented shape", () => {
    const clients = parseClientsJson(JSON.stringify(valid))
    expect(clients.map((c) => c.clientId)).toEqual(["saga", "hollowmere"])
    expect(clients[0]!.firstParty).toBe(true)
    expect(parseClientsJson(undefined)).toEqual([])
  })

  it("rejects unsafe configurations", () => {
    const bad = [
      { saga: { type: "confidential", redirectUris: ["https://a.example/cb"] } },
      { hm: { type: "public", secret: "y".repeat(20), redirectUris: ["http://127.0.0.1/callback"] } },
      { saga: { type: "confidential", secret: "x".repeat(32), redirectUris: ["http://saga.tretu.de/cb"] } },
      { saga: { type: "confidential", secret: "x".repeat(32), redirectUris: ["https://saga.tretu.de/cb#frag"] } },
      { Saga: { type: "confidential", secret: "x".repeat(32), redirectUris: ["https://saga.tretu.de/cb"] } },
      { saga: { type: "confidential", secret: "short", redirectUris: ["https://saga.tretu.de/cb"] } },
    ]
    for (const config of bad) expect(() => parseClientsJson(JSON.stringify(config))).toThrow()
    expect(() => parseClientsJson("{not json")).toThrow(/not valid JSON/)
  })

  it("stores secrets like the plugin's default hasher (base64url SHA-256, no padding)", () => {
    expect(hashClientSecret("abc")).toBe(createHash("sha256").update("abc").digest("base64url"))
    expect(hashClientSecret("abc")).not.toContain("=")
  })

  it("maps clients to rows: first-party skip consent, public clients use PKCE without secret", () => {
    const [saga, hm] = parseClientsJson(JSON.stringify(valid))
    expect(toClientRow(saga!)).toMatchObject({ skipConsent: true, enableEndSession: true, tokenEndpointAuthMethod: "client_secret_basic", requirePKCE: true })
    expect(toClientRow(hm!)).toMatchObject({ clientSecret: null, tokenEndpointAuthMethod: "none", applicationType: "native" })
    expect(postLogoutUris(saga!)).toEqual(["https://saga.tretu.de/"])
    expect(postLogoutUris(hm!)).toEqual(["https://hollowmere.tretu.de/", "http://127.0.0.1/"])
  })
})
