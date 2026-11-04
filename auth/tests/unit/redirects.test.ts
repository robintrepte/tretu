import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { describe, expect, it } from "vitest"
import { allowsTestOverrides, resolveSteamEndpoint, rpIdFor, STEAM_OPENID_ENDPOINT } from "@/lib/env"
import { authorizeContinuation, isSafeRelativePath, safeNext, toSafePath } from "@/lib/redirects"
import { confidentialClientIds, generatedSecrets } from "@/lib/secrets"
import { normalizeAccountId } from "@/lib/tretu/links"

const ISSUER = "https://auth.tretu.de"

describe("open-redirect protection", () => {
  it("accepts same-site paths and issuer URLs", () => {
    for (const ok of ["/konto", "/konto?tab=konten", "/login?client_id=saga&sig=x", "/api/auth/oauth2/authorize?a=b#frag"]) {
      expect(isSafeRelativePath(ok)).toBe(true)
      expect(toSafePath(ok, ISSUER)).toBe(ok)
    }
    expect(toSafePath("https://auth.tretu.de/konto?tab=x", ISSUER)).toBe("/konto?tab=x")
  })

  it("refuses anything that can leave the site", () => {
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/ /evil.example",
      "\\\\evil.example",
      "https://evil.example/konto",
      "https://auth.tretu.de.evil.example/",
      "https://user:pw@auth.tretu.de/konto",
      "http://auth.tretu.de/konto",
      "javascript:alert(1)",
      "data:text/html,x",
      "konto",
      "",
      "/x".padEnd(3000, "x"),
    ]) {
      expect(toSafePath(bad, ISSUER), bad).toBeNull()
    }
    expect(toSafePath(42, ISSUER)).toBeNull()
    expect(safeNext("//evil.example")).toBe("/konto")
    expect(safeNext(["/\t/evil.example"])).toBe("/konto")
    expect(safeNext("/konto?tab=sicherheit")).toBe("/konto?tab=sicherheit")
  })

  it("continues an app sign-in at the authorization endpoint without the signature and without prompt=login", async () => {
    const next = authorizeContinuation("client_id=saga&redirect_uri=https%3A%2F%2Fsaga.tretu.de%2Fcb&state=s&prompt=login+consent&max_age=0&sig=abc&exp=1&ba_iat=2&ba_param=client_id")
    const url = new URL(next, ISSUER)
    expect(url.pathname).toBe("/api/auth/oauth2/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: "saga", redirect_uri: "https://saga.tretu.de/cb", state: "s", prompt: "consent" })
    expect(isSafeRelativePath(next)).toBe(true)
    expect(new URL(authorizeContinuation("client_id=saga&prompt=login"), ISSUER).searchParams.has("prompt")).toBe(false)
    // Not a signed request any more: nothing can be replayed as one.
    expect(await verifyOAuthQueryParams(url.search.slice(1), "secret")).toBe(false)
  })
})

describe("test-only overrides", () => {
  it("are refused for any real deployment", () => {
    expect(allowsTestOverrides("http://localhost:3121")).toBe(true)
    expect(allowsTestOverrides("http://127.0.0.1:3131")).toBe(true)
    expect(allowsTestOverrides("https://auth.tretu.de")).toBe(false)
    expect(allowsTestOverrides("https://localhost:3121")).toBe(false)
    expect(allowsTestOverrides("http://auth.tretu.de")).toBe(false)
    expect(resolveSteamEndpoint(undefined, "https://auth.tretu.de")).toBe(STEAM_OPENID_ENDPOINT)
    expect(resolveSteamEndpoint("http://127.0.0.1:3124/openid/login", "http://localhost:3121")).toBe("http://127.0.0.1:3124/openid/login")
    expect(() => resolveSteamEndpoint("http://127.0.0.1:3124/openid/login", "https://auth.tretu.de")).toThrow(/tests only/)
  })
})

describe("passkey relying party", () => {
  it("is tretu.de for every Tretu host (passkeys work on all subdomains), else the issuer host", () => {
    expect(rpIdFor("https://auth.tretu.de")).toBe("tretu.de")
    expect(rpIdFor("https://tretu.de")).toBe("tretu.de")
    expect(rpIdFor("https://auth.nottretu.de")).toBe("auth.nottretu.de")
    expect(rpIdFor("http://localhost:3131")).toBe("localhost")
    expect(rpIdFor("https://auth.tretu.de", "auth.tretu.de")).toBe("auth.tretu.de")
  })
})

describe("npm run secrets", () => {
  it("prints BETTER_AUTH_SECRET and one secret per confidential client", () => {
    let n = 0
    const lines = generatedSecrets(undefined, (bytes) => `r${bytes}-${++n}`)
    expect(lines).toContain("BETTER_AUTH_SECRET=r48-1")
    expect(lines.filter((l) => /^[a-z-]+=r32-/.test(l)).map((l) => l.split("=")[0])).toEqual(["tretu-web", "saga", "play", "mc-dashboard", "city"])
    expect(confidentialClientIds(JSON.stringify({ saga: { type: "confidential" }, hollowmere: { type: "public" } }))).toEqual(["saga"])
  })
})

describe("admin API account ids", () => {
  it("normalises Minecraft, Steam and TeamSpeak ids", () => {
    expect(normalizeAccountId("minecraft", "069A79F444E94726A5BEFCA90E38AAF5")).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5")
    expect(normalizeAccountId("steam", "76561197960287930")).toBe("76561197960287930")
    expect(normalizeAccountId("steam", "123")).toBeNull()
    expect(normalizeAccountId("teamspeak", "aB3+/xYz09kLmNoPqRsTuVwXyZ0=")).toBe("aB3+/xYz09kLmNoPqRsTuVwXyZ0=")
    expect(normalizeAccountId("teamspeak", "not valid!")).toBeNull()
    expect(normalizeAccountId("teamspeak", "x".repeat(65))).toBeNull()
  })
})
