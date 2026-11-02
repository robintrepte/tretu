import { z } from "zod"

export interface SteamProfile {
  personaName: string | null
  avatar: string | null
}

const summaries = z.object({
  response: z.object({
    players: z.array(z.object({ steamid: z.string(), personaname: z.string().optional(), avatarfull: z.string().optional() })),
  }),
})

/** Steam serves avatars from its CDN over https; anything else is ignored. */
function avatarUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && (url.hostname.endsWith(".steamstatic.com") || url.hostname.endsWith(".akamaihd.net")) ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Persona name and avatar from the Steam Web API (ISteamUser/GetPlayerSummaries). Optional: without a key, or if
 * Steam does not answer within 5 s, the sign-in simply goes on without them. The key is never logged.
 */
export async function fetchSteamProfile(steamId: string, apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Promise<SteamProfile | null> {
  if (!apiKey) return null
  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/")
  url.searchParams.set("key", apiKey)
  url.searchParams.set("steamids", steamId)
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5000) })
    if (!response.ok) {
      console.warn(`[steam] profile lookup answered ${response.status}`)
      return null
    }
    const parsed = summaries.safeParse(await response.json())
    const player = parsed.success ? parsed.data.response.players.find((p) => p.steamid === steamId) : undefined
    if (!player) return null
    const personaName = player.personaname?.trim().slice(0, 64) || null
    return { personaName, avatar: avatarUrl(player.avatarfull) }
  } catch (error) {
    console.warn("[steam] profile lookup failed:", error instanceof Error ? error.name : "error")
    return null
  }
}
