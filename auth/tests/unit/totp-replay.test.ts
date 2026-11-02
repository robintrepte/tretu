import { createOTP } from "@better-auth/utils/otp"
import { describe, expect, it } from "vitest"
import { matchingCounter } from "@/lib/totp-replay"

const secret = "abcdefghijklmnopqrstuvwxyz012345"
const otp = createOTP(secret, { digits: 6 })
const NOW = Date.UTC(2026, 10, 2, 12, 0, 10)
const step = Math.floor(NOW / 30_000)

describe("TOTP time steps", () => {
  it("finds the step of a code within ±1 step and nothing outside", async () => {
    expect(await matchingCounter(secret, await otp.hotp(step), NOW)).toBe(step)
    expect(await matchingCounter(secret, await otp.hotp(step - 1), NOW)).toBe(step - 1)
    expect(await matchingCounter(secret, await otp.hotp(step + 1), NOW)).toBe(step + 1)
    expect(await matchingCounter(secret, await otp.hotp(step - 2), NOW)).toBeNull()
    expect(await matchingCounter(secret, await otp.hotp(step + 2), NOW)).toBeNull()
  })

  it("ignores malformed codes", async () => {
    for (const bad of ["", "12345", "1234567", "abcdef", " 123456"]) expect(await matchingCounter(secret, bad, NOW)).toBeNull()
  })

  it("works with byte secrets (base32-stored)", async () => {
    const bytes = new TextEncoder().encode(secret)
    expect(await matchingCounter(bytes, await otp.hotp(step), NOW)).toBe(step)
  })
})
