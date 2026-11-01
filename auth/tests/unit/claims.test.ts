import { describe, expect, it } from "vitest"
import { buildClaims, isPlaceholderEmail, placeholderEmail, type ClaimSource } from "@/lib/oidc/claims"

const user: ClaimSource = {
  id: "7d1c0d2e-7a4b-4c55-9a3e-1b2c3d4e5f60",
  name: "Robin T.",
  email: "robin@example.test",
  emailVerified: true,
  image: "https://cdn.example.test/a.png",
  username: "robin",
  displayUsername: "Robin",
  locale: "en",
  roles: ["admin"],
}
const links = { discord: "123456789012345678", minecraft: "069a79f4-44e9-4726-a5be-fca90e38aaf5", minecraftName: "Notch", steam: "76561197960287930" }

describe("claim mapping", () => {
  it("maps profile claims", () => {
    expect(buildClaims(user, links, ["openid", "profile"])).toEqual({
      preferred_username: "Robin",
      name: "Robin T.",
      picture: "https://cdn.example.test/a.png",
      locale: "en",
    })
  })

  it("maps email claims", () => {
    expect(buildClaims(user, links, ["openid", "email"])).toEqual({ email: "robin@example.test", email_verified: true })
    expect(buildClaims({ ...user, emailVerified: false }, links, ["email"]).email_verified).toBe(false)
  })

  it("never marks placeholder emails as verified", () => {
    const email = placeholderEmail(user.id)
    expect(isPlaceholderEmail(email)).toBe(true)
    expect(buildClaims({ ...user, email, emailVerified: true }, {}, ["email"]).email_verified).toBe(false)
  })

  it("maps the tretu scope and leaves absent links out", () => {
    expect(buildClaims(user, links, ["openid", "tretu"])).toEqual({
      roles: ["admin"],
      discord_id: "123456789012345678",
      minecraft_uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      minecraft_name: "Notch",
      steam_id: "76561197960287930",
    })
    expect(buildClaims({ ...user, roles: null }, {}, ["tretu"])).toEqual({ roles: [] })
  })

  it("defaults unknown locales to German and falls back to the lowercase username", () => {
    const claims = buildClaims({ ...user, locale: "fr", displayUsername: null, image: null }, {}, ["profile"])
    expect(claims).toEqual({ preferred_username: "robin", name: "Robin T.", locale: "de" })
  })

  it("returns nothing for openid only", () => {
    expect(buildClaims(user, links, ["openid"])).toEqual({})
  })
})
