import { describe, expect, it } from "vitest"
import { basicCredentials, fixHostCookie, postToBasic } from "@/lib/oidc/http"

describe("client_secret_post → client_secret_basic", () => {
  const form = "application/x-www-form-urlencoded"
  it("moves the credentials into a Basic header", () => {
    const result = postToBasic("/api/auth/oauth2/token", form, null, "grant_type=authorization_code&code=abc&client_id=saga&client_secret=s%3Acret+x")
    expect(result).toEqual({ body: "grant_type=authorization_code&code=abc", authorization: basicCredentials("saga", "s:cret x") })
    expect(Buffer.from(result!.authorization.slice(6), "base64").toString()).toBe("saga:s%3Acret+x")
  })
  it("leaves other requests alone", () => {
    expect(postToBasic("/api/auth/oauth2/token", form, "Basic abc", "client_id=a&client_secret=b")).toBeNull()
    expect(postToBasic("/api/auth/oauth2/token", "application/json", null, "client_id=a&client_secret=b")).toBeNull()
    expect(postToBasic("/api/auth/oauth2/token", form, null, "client_id=hollowmere&code_verifier=x")).toBeNull()
    expect(postToBasic("/api/auth/oauth2/token", form, null, "client_id=a&client_secret=b&client_secret=c")).toBeNull()
    expect(postToBasic("/api/auth/sign-in/email", form, null, "client_id=a&client_secret=b")).toBeNull()
  })
  it("covers revoke and introspect", () => {
    expect(postToBasic("/api/auth/oauth2/revoke", form, null, "token=t&client_id=a&client_secret=b")?.body).toBe("token=t")
    expect(postToBasic("/api/auth/oauth2/introspect", form, null, "token=t&client_id=a&client_secret=b")?.body).toBe("token=t")
  })
})

describe("__Host- cookies", () => {
  it("forces Path=/ and removes Domain", () => {
    expect(fixHostCookie("__Host-tretu.x=1; Path=/api/auth/oauth2/end-session/confirm; HttpOnly; Secure; SameSite=Lax")).toBe(
      "__Host-tretu.x=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    )
    expect(fixHostCookie("__Host-tretu.x=1; Domain=tretu.de; HttpOnly")).toBe("__Host-tretu.x=1; Path=/; HttpOnly; Secure")
  })
  it("keeps other cookies as they are", () => {
    expect(fixHostCookie("NEXT_LOCALE=de; Path=/; SameSite=Lax")).toBe("NEXT_LOCALE=de; Path=/; SameSite=Lax")
  })
})
