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
  "teamspeak_uid",
  "legacy_ids",
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
  teamspeak?: string
  teamspeakName?: string
}

/** The apps whose old accounts the legacy import links (`legacy_link.app`). */
export const LEGACY_APPS = ["saga", "play", "hollowmere", "tretu-web"] as const
export type LegacyApp = (typeof LEGACY_APPS)[number]

/**
 * The `legacy_ids` claim: per app, the id of the old app account linked to this Tretu-Konto (the app's own user id as a
 * string; Hollowmere: the Nakama user id). Only apps with a link appear.
 */
export type LegacyIds = Partial<Record<LegacyApp, string>>

export interface LegacyLinkRow {
  app: string
  legacyUserId: string
  method: string
  importedAt: Date
}

/** The account's own import first, then links merged onto it (import merge, then admin merge), oldest first. */
const METHOD_RANK: Record<string, number> = { import: 0, merge: 1, admin: 2 }

/**
 * Builds `legacy_ids` from the account's `legacy_link` rows. When an account holds several old accounts of the same app
 * (after a merge), one id per app is chosen deterministically: its own import before merged ones, then the oldest
 * import, then the smallest id.
 */
export function legacyIdsFromLinks(rows: readonly LegacyLinkRow[]): LegacyIds {
  const sorted = rows
    .filter((r): r is LegacyLinkRow & { app: LegacyApp } => (LEGACY_APPS as readonly string[]).includes(r.app) && r.legacyUserId !== "")
    .toSorted(
      (a, b) =>
        (METHOD_RANK[a.method] ?? 9) - (METHOD_RANK[b.method] ?? 9) ||
        a.importedAt.getTime() - b.importedAt.getTime() ||
        (a.legacyUserId < b.legacyUserId ? -1 : a.legacyUserId > b.legacyUserId ? 1 : 0),
    )
  const ids: LegacyIds = {}
  for (const row of sorted) ids[row.app] ??= String(row.legacyUserId)
  return ids
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
 * (never `null`), as the contract says "string or absent"; `legacy_ids` likewise only when there is one.
 */
export function buildClaims(
  user: ClaimSource,
  links: UserLinks,
  scopes: readonly string[],
  legacyIds: LegacyIds = {},
): Record<string, unknown> {
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
    if (links.teamspeak) claims.teamspeak_uid = links.teamspeak
    // Absent (not `{}`) when the account has no old app accounts, like the other link claims.
    const legacy = Object.fromEntries(LEGACY_APPS.filter((app) => legacyIds[app]).map((app) => [app, legacyIds[app]!]))
    if (Object.keys(legacy).length) claims.legacy_ids = legacy
  }
  for (const key of Object.keys(claims)) if (claims[key] === undefined) delete claims[key]
  return claims
}
