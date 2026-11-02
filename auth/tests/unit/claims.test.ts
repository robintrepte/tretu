import { describe, expect, it } from "vitest"
import { buildClaims, isPlaceholderEmail, legacyIdsFromLinks, placeholderEmail, TRETU_CLAIMS, type ClaimSource, type LegacyLinkRow } from "@/lib/oidc/claims"

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
const links = { discord: "123456789012345678", minecraft: "069a79f4-44e9-4726-a5be-fca90e38aaf5", minecraftName: "Notch", steam: "76561197960287930", teamspeak: "aB3+/xYz09kLmNoPqRsTuVwXyZ0=", teamspeakName: "Robin" }

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
      teamspeak_uid: "aB3+/xYz09kLmNoPqRsTuVwXyZ0=",
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

  it("adds legacy_ids with the tretu scope, only for apps with a link", () => {
    const legacy = { saga: "42", hollowmere: "5f0c3b8e-1d2a-4c6b-9e7f-0a1b2c3d4e5f" }
    expect(buildClaims(user, {}, ["openid", "tretu"], legacy)).toEqual({ roles: ["admin"], legacy_ids: legacy })
    expect(buildClaims(user, {}, ["openid", "tretu"], { play: "", "tretu-web": "7" })).toEqual({ roles: ["admin"], legacy_ids: { "tretu-web": "7" } })
  })

  it("leaves legacy_ids out without links or without the tretu scope", () => {
    expect(buildClaims(user, {}, ["openid", "tretu"], {})).toEqual({ roles: ["admin"] })
    expect(buildClaims(user, {}, ["openid", "tretu"])).not.toHaveProperty("legacy_ids")
    expect(buildClaims(user, links, ["openid", "profile", "email"], { saga: "42" })).not.toHaveProperty("legacy_ids")
    expect(TRETU_CLAIMS).toContain("legacy_ids")
  })
})

describe("legacy_ids from legacy_link rows", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 0, day))
  const row = (app: string, legacyUserId: string, method = "import", day = 1): LegacyLinkRow => ({ app, legacyUserId, method, importedAt: at(day) })

  it("maps every app to its old user id as a string", () => {
    expect(
      legacyIdsFromLinks([row("saga", "12"), row("play", "cuid_abc"), row("hollowmere", "5f0c3b8e-1d2a-4c6b-9e7f-0a1b2c3d4e5f"), row("tretu-web", "7")]),
    ).toEqual({ saga: "12", play: "cuid_abc", hollowmere: "5f0c3b8e-1d2a-4c6b-9e7f-0a1b2c3d4e5f", "tretu-web": "7" })
  })

  it("is empty without links and ignores unknown apps and empty ids", () => {
    expect(legacyIdsFromLinks([])).toEqual({})
    expect(legacyIdsFromLinks([row("mc-dashboard", "1"), row("saga", "")])).toEqual({})
  })

  it("keeps the account's own old account when a merge brought a second one of the same app", () => {
    // After `admin merge`, the survivor holds its own import and the moved link (method `admin`).
    expect(legacyIdsFromLinks([row("saga", "99", "admin", 1), row("saga", "12", "import", 5)])).toEqual({ saga: "12" })
    // Import merges rank before admin merges; then the oldest import; then the smallest id.
    expect(legacyIdsFromLinks([row("play", "b", "admin", 1), row("play", "a", "merge", 9)])).toEqual({ play: "a" })
    expect(legacyIdsFromLinks([row("play", "new", "merge", 9), row("play", "old", "merge", 2)])).toEqual({ play: "old" })
    expect(legacyIdsFromLinks([row("play", "y", "merge", 2), row("play", "x", "merge", 2)])).toEqual({ play: "x" })
  })

  it("takes a moved link when the survivor had none of that app", () => {
    expect(legacyIdsFromLinks([row("saga", "12"), row("hollowmere", "nakama-1", "admin")])).toEqual({ saga: "12", hollowmere: "nakama-1" })
  })
})
