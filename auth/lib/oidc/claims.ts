/** OIDC claim mapping (contract §2). Pure: the database lookups live in lib/users.ts. */

export const TRETU_SCOPES = ["openid", "profile", "email", "offline_access", "tretu"] as const
export type TretuScope = (typeof TRETU_SCOPES)[number]

export const TRETU_CLAIMS = [
  "sub",
  "iss",
  "aud",
  "exp",
  "iat",
  "auth_time",
  "nonce",
  "sid",
  "preferred_username",
  "name",
  "picture",
  "locale",
  "email",
  "email_verified",
  "roles",
  "discord_id",
  "minecraft_uuid",
  "minecraft_name",
  "steam_id",
] as const

export type Locale = "de" | "en"

export interface ClaimSource {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  username: string | null
  displayUsername: string | null
  locale: string | null
  roles: readonly string[] | null
}

export interface UserLinks {
  discord?: string
  minecraft?: string
  minecraftName?: string
  steam?: string
}

export function normalizeLocale(value: unknown): Locale {
  return value === "en" ? "en" : "de"
}

/** Emails of accounts imported without one: never deliverable, never verified. */
export const PLACEHOLDER_EMAIL_DOMAIN = "users.tretu.invalid"
export const isPlaceholderEmail = (email: string) => email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)
export const placeholderEmail = (id: string) => `u-${id}@${PLACEHOLDER_EMAIL_DOMAIN}`

/**
 * The claims for the granted scopes, used for both the ID token and userinfo. Absent links are left out
 * (never `null`), as the contract says "string or absent".
 */
export function buildClaims(user: ClaimSource, links: UserLinks, scopes: readonly string[]): Record<string, unknown> {
  const claims: Record<string, unknown> = {}
  if (scopes.includes("profile")) {
    claims.preferred_username = user.displayUsername || user.username || undefined
    claims.name = user.name
    if (user.image) claims.picture = user.image
    claims.locale = normalizeLocale(user.locale)
  }
  if (scopes.includes("email")) {
    claims.email = user.email
    claims.email_verified = user.emailVerified && !isPlaceholderEmail(user.email)
  }
  if (scopes.includes("tretu")) {
    claims.roles = [...(user.roles ?? [])]
    if (links.discord) claims.discord_id = links.discord
    if (links.minecraft) claims.minecraft_uuid = links.minecraft
    if (links.minecraftName) claims.minecraft_name = links.minecraftName
    if (links.steam) claims.steam_id = links.steam
  }
  for (const key of Object.keys(claims)) if (claims[key] === undefined) delete claims[key]
  return claims
}
