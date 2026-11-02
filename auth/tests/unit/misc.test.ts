import { describe, expect, it } from "vitest"
import de from "@/messages/de.json"
import en from "@/messages/en.json"
import { buildCsp } from "@/lib/csp"
import { toDate } from "@/lib/legacy/sources"
import { isValidUsername, pickUsername, slugifyUsername } from "@/lib/usernames"

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix]
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
}

describe("messages", () => {
  it("German and English have the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(de).sort())
  })
  it("keys never contain dots (next-intl nesting)", () => {
    const walk = (v: unknown): string[] => (v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...walk(x)]) : [])
    expect(walk(de).filter((k) => k.includes("."))).toEqual([])
  })
})

describe("usernames", () => {
  it("validates the shared Tretu format", () => {
    for (const ok of ["robin", "Robin_T", "a-b", "x".repeat(24)]) expect(isValidUsername(ok)).toBe(true)
    for (const bad of ["ab", "x".repeat(25), "robin t", "röbin", "admin", "KONTO", ""]) expect(isValidUsername(bad)).toBe(false)
  })
  it("derives candidates from Discord/Google names and emails", () => {
    expect(slugifyUsername("Jürgen Groß")).toBe("Jurgen_Gross")
    expect(slugifyUsername("max.mustermann@example.com")).toBe("max_mustermann")
    expect(slugifyUsername("🙂")).toBe("spieler")
    expect(slugifyUsername("ab")).toBe("spieler_ab")
    expect(slugifyUsername("admin")).toBe("spieler_admin")
  })
  it("picks a free name", async () => {
    const taken = new Set(["robin"])
    const name = await pickUsername("Robin", (n) => taken.has(n))
    expect(name).toMatch(/^Robin_\d{4}$/)
    expect(await pickUsername("Newbie", () => false)).toBe("Newbie")
  })
})

describe("legacy sources", () => {
  it("reads legacy timestamps in every format", () => {
    expect(toDate(1767225600).toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(toDate("1767225600000").toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(toDate("2026-01-01T00:00:00Z").toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(toDate(null).getTime()).toBe(0)
  })
})

describe("content security policy", () => {
  it("is strict by default and opens only what is configured", () => {
    const csp = buildCsp({ nonce: "abc", dev: false, https: true, turnstile: false })
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("upgrade-insecure-requests")
    expect(csp).not.toContain("unsafe-eval")
    const open = buildCsp({ nonce: "n", dev: false, https: true, turnstile: true, umamiSrc: "https://stats.tretu.de/script.js" })
    expect(open).toContain("https://challenges.cloudflare.com")
    expect(open).toContain("https://stats.tretu.de")
  })
})
