/** Providers other Tretu services link through the admin API (contract §2, plus TeamSpeak). */
export const LINK_PROVIDERS = ["minecraft", "steam", "teamspeak"] as const
export type LinkProvider = (typeof LINK_PROVIDERS)[number]

/**
 * Account ids in one canonical form, so the same player is never linked twice: Minecraft UUIDs lowercase with
 * dashes, SteamID64 as 17 digits, TeamSpeak unique identities as given (base64, case-sensitive).
 */
export function normalizeAccountId(kind: LinkProvider, id: string): string | null {
  if (kind === "steam") return /^\d{17}$/.test(id) && BigInt(id) > 76561197960265728n ? id : null
  if (kind === "teamspeak") return /^[A-Za-z0-9+/=_-]{1,64}$/.test(id) ? id : null
  const hex = id.toLowerCase().replace(/-/g, "")
  if (!/^[0-9a-f]{32}$/.test(hex)) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

