import { describe, expect, it } from "vitest"
import { ROLE_PATTERN } from "@/lib/admin/actions"
import { decodeCursor, encodeCursor } from "@/lib/admin/users"
import { signedPathCandidates } from "@/lib/tretu/admin-api"
import { computeSignature, verifySignedRequest } from "@/lib/tretu/signing"
import { isLockActive } from "@/lib/users"

describe("account lock", () => {
  const now = new Date("2026-11-02T12:00:00Z")
  it("is in force while locked and before lockedUntil", () => {
    expect(isLockActive({ locked: true, lockedUntil: null }, now)).toBe(true)
    expect(isLockActive({ locked: true, lockedUntil: new Date("2026-11-02T12:00:01Z") }, now)).toBe(true)
    expect(isLockActive({ locked: true, lockedUntil: new Date("2026-11-02T12:00:00Z") }, now)).toBe(false)
    expect(isLockActive({ locked: true, lockedUntil: new Date("2026-11-01T00:00:00Z") }, now)).toBe(false)
    expect(isLockActive({ locked: false, lockedUntil: null }, now)).toBe(false)
    expect(isLockActive(null, now)).toBe(false)
  })
})

describe("admin search cursor", () => {
  it("round-trips and rejects anything else", () => {
    const cursor = [1, "2026-11-02T08:15:30.123456Z", "8c0e7f1a-1111-4a5b-8c9d-123456789abc"] as [1, string, string]
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
    for (const bad of ["", "bm9wZQ", Buffer.from(JSON.stringify([2, "2026-11-02T08:15:30.123456Z", "x"])).toString("base64url"), Buffer.from(JSON.stringify([0, "2026-11-02", "x"])).toString("base64url")]) {
      expect(decodeCursor(bad), bad).toBeNull()
    }
  })
})

describe("roles", () => {
  it("are short lowercase names", () => {
    for (const ok of ["admin", "moderator", "beta-tester", "team_2"]) expect(ROLE_PATTERN.test(ok)).toBe(true)
    for (const bad of ["Admin", "", "2fa", "a b", "x".repeat(33), "admin;drop"]) expect(ROLE_PATTERN.test(bad)).toBe(false)
  })
})

describe("signed path of admin API reads", () => {
  it("accepts the query as Next.js re-serialises it and as encodeURIComponent writes it", () => {
    // Next.js hands route handlers `?q=a+b%27` for a request sent as `?q=a%20b'`.
    const url = new URL("http://localhost/api/v1/admin/users?q=a+b%27&limit=2")
    expect(signedPathCandidates(url)).toEqual(["/api/v1/admin/users?q=a+b%27&limit=2", "/api/v1/admin/users?q=a%20b'&limit=2"])
    expect(signedPathCandidates(new URL("http://localhost/api/v1/admin/stats"))).toEqual(["/api/v1/admin/stats"])
    expect(signedPathCandidates(new URL("http://localhost/api/v1/admin/users?q=abc"))).toEqual(["/api/v1/admin/users?q=abc"])

    const secret = "test-secret-123"
    const timestamp = String(Math.floor(Date.now() / 1000))
    const headers = new Headers({ "x-tretu-app": "tretu-web", "x-tretu-timestamp": timestamp, "x-tretu-signature": computeSignature(secret, timestamp, "GET", "/api/v1/admin/users?q=a%20b'&limit=2", "") })
    const ok = signedPathCandidates(url).some((pathWithQuery) => verifySignedRequest({ headers, method: "GET", pathWithQuery, rawBody: "", secrets: { "tretu-web": secret } }).ok)
    expect(ok).toBe(true)
  })
})
