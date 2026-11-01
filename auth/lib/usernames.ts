import { randomInt } from "node:crypto"

/** Usernames are shared by every Tretu app (profiles at tretu.de/u/<username>), unique ignoring case. */
export const USERNAME_MIN = 3
export const USERNAME_MAX = 24
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/

/** Names that would collide with routes on tretu.de or the apps, or impersonate staff. */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "system", "support", "help", "hilfe", "moderator", "mod", "staff", "team",
  "tretu", "tretu-de", "official", "offiziell", "api", "auth", "konto", "account", "login", "logout", "register",
  "registrieren", "settings", "einstellungen", "u", "user", "users", "me", "null", "undefined", "anonymous",
  "guest", "gast", "saga", "play", "hollowmere", "minecraft", "mc", "discord", "teamspeak", "impressum",
  "datenschutz", "agb", "privacy", "terms", "platform", "stats", "status", "www", "mail", "noreply", "no-reply",
])

export function normalizeUsername(name: string): string {
  return name.trim().toLowerCase()
}

export function isValidUsername(name: string): boolean {
  return USERNAME_PATTERN.test(name) && !RESERVED_USERNAMES.has(normalizeUsername(name))
}

/** Turns any display name or email into a username candidate (not checked for uniqueness). */
export function slugifyUsername(input: string): string {
  const base = (input.split("@")[0] ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 18)
  if (base.length < USERNAME_MIN || RESERVED_USERNAMES.has(base.toLowerCase())) return `spieler_${base}`.slice(0, 18).replace(/_$/, "") || "spieler"
  return base
}

export function withSuffix(base: string): string {
  return `${base.slice(0, USERNAME_MAX - 5)}_${randomInt(1000, 10000)}`
}

/**
 * Picks a free username for `seed`: the slug itself, else with a random number. `isTaken` checks the database
 * (and may also check names reserved in the same import run).
 */
export async function pickUsername(seed: string, isTaken: (lowercase: string) => Promise<boolean> | boolean): Promise<string> {
  const base = slugifyUsername(seed)
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = attempt === 0 ? base : withSuffix(base)
    if (!RESERVED_USERNAMES.has(candidate.toLowerCase()) && !(await isTaken(candidate.toLowerCase()))) return candidate
  }
  return withSuffix(`spieler${Date.now().toString(36)}`)
}
