import { describe, expect, it } from "vitest"
import { ISSUER } from "./env"
import { Jar, locationOf, registerVerifiedUser, request } from "./helpers"

/** Redirect parameters, headers and error pages. */

describe("open redirects", () => {
  const evil = ["https://evil.example/", "//evil.example/x", "/\\evil.example", "/\t/evil.example", "https://localhost:3121.evil.example/"]

  it("refuses foreign callback URLs on every Better Auth endpoint that redirects", async () => {
    for (const target of evil) {
      const social = await request(new Jar(), "/api/auth/sign-in/social", { method: "POST", json: { provider: "discord", callbackURL: target } })
      expect(social.status, `social ${target}`).toBe(403)
      const socialError = await request(new Jar(), "/api/auth/sign-in/social", { method: "POST", json: { provider: "google", callbackURL: "/konto", errorCallbackURL: target } })
      expect(socialError.status, `social error ${target}`).toBe(403)
      const magic = await request(new Jar(), "/api/auth/sign-in/magic-link", { method: "POST", json: { email: "nobody@example.test", callbackURL: target } })
      expect(magic.status, `magic ${target}`).toBe(403)
      const verify = await request(new Jar(), `/api/auth/magic-link/verify?token=x&callbackURL=${encodeURIComponent(target)}`)
      expect(verify.status, `verify ${target}`).toBe(403)
      const reset = await request(new Jar(), "/api/auth/request-password-reset", { method: "POST", json: { email: "nobody@example.test", redirectTo: target } })
      expect(reset.status, `reset ${target}`).toBe(403)
    }
  })

  it("keeps ?next= on the site", async () => {
    const user = await registerVerifiedUser("redirect")
    for (const target of evil) {
      const res = await request(user.jar, `/login?next=${encodeURIComponent(target)}`)
      expect(locationOf(res).origin).toBe(ISSUER)
      expect(locationOf(res).pathname).toBe("/konto")
    }
    const ok = await request(user.jar, `/login?next=${encodeURIComponent("/konto?tab=sicherheit")}`)
    expect(locationOf(ok).pathname + locationOf(ok).search).toBe("/konto?tab=sicherheit")
    const twoFactor = await (await request(new Jar(), `/2fa?next=${encodeURIComponent("//evil.example")}`)).text()
    // The form is given the safe fallback, not the foreign target.
    expect(twoFactor).toMatch(/\\?"next\\?":\\?"\/konto\\?"/)
  })
})

describe("headers and pages", () => {
  it("sends a strict CSP (Steam avatars allowed) and the security headers", async () => {
    const res = await request(new Jar(), "/login")
    expect(res.status).toBe(200)
    const csp = res.headers.get("content-security-policy") ?? ""
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("https://avatars.steamstatic.com")
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
    expect(res.headers.get("x-frame-options")).toBe("DENY")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("strict-transport-security")).toContain("max-age=")
  })

  it("shows Steam on the login page in Steam's style", async () => {
    const html = await (await request(new Jar(), "/login")).text()
    expect(html).toContain("Mit Steam anmelden")
    expect(html).toContain("Weiter mit Discord")
  })

  it("renders friendly error pages for Steam codes and unknown codes", async () => {
    const steam = await (await request(new Jar(), "/fehler?error=steam_failed")).text()
    expect(steam).toContain("Steam konnte die Anmeldung nicht bestätigen")
    const unknown = await request(new Jar(), "/fehler?error=<script>alert(1)</script>")
    expect(unknown.status).toBe(200)
    expect(await unknown.text()).not.toContain("<script>alert(1)</script>")
  })

  it("answers the health check without secrets", async () => {
    const res = await fetch(`${ISSUER}/api/health`)
    const body = (await res.json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["app", "checks", "status", "time", "version"])
    expect(res.headers.get("cache-control")).toContain("no-store")
  })
})
