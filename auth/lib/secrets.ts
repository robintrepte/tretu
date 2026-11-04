/** The confidential OIDC clients of contract §2, used when TRETU_OAUTH_CLIENTS_JSON is not set yet. */
const DEFAULT_CONFIDENTIAL_CLIENTS = ["tretu-web", "saga", "play", "mc-dashboard", "city"]

/** Confidential client ids from TRETU_OAUTH_CLIENTS_JSON (public clients like Hollowmere have no secret). */
export function confidentialClientIds(clientsJson: string | undefined): string[] {
  if (!clientsJson?.trim()) return DEFAULT_CONFIDENTIAL_CLIENTS
  try {
    const parsed = JSON.parse(clientsJson) as Record<string, { type?: string }>
    return Object.entries(parsed)
      .filter(([, client]) => client?.type !== "public")
      .map(([id]) => id)
  } catch {
    return DEFAULT_CONFIDENTIAL_CLIENTS
  }
}

/** The output of `npm run secrets` (pure, tested in tests/unit/misc.test.ts). Values come from `random(bytes)`. */
export function generatedSecrets(clientsJson: string | undefined, random: (bytes: number) => string): string[] {
  const lines = ["# Freshly generated secrets (nothing was stored). Keep them in the password manager.", "", `BETTER_AUTH_SECRET=${random(48)}`, ""]
  lines.push("# OIDC client secrets: \"secret\" in TRETU_OAUTH_CLIENTS_JSON here, TRETU_AUTH_CLIENT_SECRET in the app")
  for (const id of confidentialClientIds(clientsJson)) lines.push(`${id}=${random(32)}`)
  return lines
}
