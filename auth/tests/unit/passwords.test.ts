import bcrypt from "bcryptjs"
import { describe, expect, it } from "vitest"
import {
  combineStored,
  fromBcrypt,
  fromNative,
  hashPassword,
  hibpCount,
  hibpParts,
  isBreachedPassword,
  isNativeHash,
  needsRehash,
  verifyStoredPassword,
} from "@/lib/passwords"

describe("password verifier", () => {
  it("verifies native Better Auth hashes (as Play stored them)", async () => {
    const hash = await hashPassword("hunter2-but-longer")
    expect(isNativeHash(hash)).toBe(true)
    expect(fromNative(hash)).toBe(hash)
    expect(await verifyStoredPassword(hash, "hunter2-but-longer")).toBe(true)
    expect(await verifyStoredPassword(hash, "wrong")).toBe(false)
    expect(needsRehash(hash)).toBe(false)
  })

  it("verifies Saga bcrypt hashes behind the bcrypt: marker", async () => {
    const raw = await bcrypt.hash("saga-password", 10)
    const stored = fromBcrypt(raw)!
    expect(stored).toBe(`bcrypt:${raw}`)
    expect(await verifyStoredPassword(stored, "saga-password")).toBe(true)
    expect(await verifyStoredPassword(stored, "Saga-password")).toBe(false)
    expect(needsRehash(stored)).toBe(true)
  })

  it("verifies Nakama bcrypt hashes stored as bytea, including $2y$", async () => {
    const raw = (await bcrypt.hash("nakama-pass", 10)).replace(/^\$2b\$/, "$2y$")
    const stored = fromBcrypt(Buffer.from(raw, "utf8"))!
    expect(stored.startsWith("bcrypt:$2y$")).toBe(true)
    expect(await verifyStoredPassword(stored, "nakama-pass")).toBe(true)
  })

  it("accepts any password of a merged account (multi:) and re-hashes", async () => {
    const play = await hashPassword("play-password-1")
    const saga = fromBcrypt(await bcrypt.hash("saga-password-2", 10))!
    const stored = combineStored([play, saga, null, play])!
    expect(stored.startsWith("multi:")).toBe(true)
    expect(await verifyStoredPassword(stored, "play-password-1")).toBe(true)
    expect(await verifyStoredPassword(stored, "saga-password-2")).toBe(true)
    expect(await verifyStoredPassword(stored, "other")).toBe(false)
    expect(needsRehash(stored)).toBe(true)
    // Combining a combined value flattens it.
    expect(combineStored([stored])).toBe(stored)
    expect(combineStored([saga])).toBe(saga)
    expect(combineStored([null, undefined])).toBeNull()
  })

  it("never accepts malformed hashes or empty passwords", async () => {
    expect(fromBcrypt("plaintext")).toBeNull()
    expect(fromNative("abc:def")).toBeNull()
    for (const bad of ["", "bcrypt:", "bcrypt:$2b$10$short", "multi:%%%", "multi:" + Buffer.from("{}").toString("base64url"), "salt:key"]) {
      expect(await verifyStoredPassword(bad, "x")).toBe(false)
    }
    expect(await verifyStoredPassword(await hashPassword("abc"), "")).toBe(false)
    expect(await verifyStoredPassword(null, "x")).toBe(false)
  })
})

describe("Have I Been Pwned range check", () => {
  it("sends only a 5-character prefix and finds the suffix", () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    expect(hibpParts("password")).toEqual({ prefix: "5BAA6", suffix: "1E4C9B93F3F0682250B6CF8331B7EE68FD8" })
    const body = "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nFFFF:0"
    expect(hibpCount(body, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9545824)
    expect(hibpCount(body, "ABCDEF")).toBe(0)
  })

  it("reports breached passwords and fails open on errors", async () => {
    const hit = (async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:3\n")) as unknown as typeof fetch
    expect(await isBreachedPassword("password", { fetchImpl: hit })).toBe(true)
    const miss = (async () => new Response("0000000000000000000000000000000000A:1\n")) as unknown as typeof fetch
    expect(await isBreachedPassword("password", { fetchImpl: miss })).toBe(false)
    const down = (async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch
    expect(await isBreachedPassword("password", { fetchImpl: down })).toBe(false)
    const status = (async () => new Response("", { status: 503 })) as unknown as typeof fetch
    expect(await isBreachedPassword("password", { fetchImpl: status })).toBe(false)
  })
})
