/** Runs once when the server starts: syncs TRETU_OAUTH_CLIENTS_JSON into the database (see lib/oidc/clients.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.CLIENTS_SYNC_ON_START === "false" || !process.env.TRETU_OAUTH_CLIENTS_JSON) return
  const [{ db }, { parseClientsJson, syncClients }] = await Promise.all([import("@/lib/db"), import("@/lib/oidc/clients")])
  try {
    const result = await syncClients(db, parseClientsJson(process.env.TRETU_OAUTH_CLIENTS_JSON))
    console.info(`[clients] synced: ${result.created.length} created, ${result.updated.length} updated, ${result.disabled.length} disabled`)
  } catch (error) {
    console.error("[clients] sync failed:", error instanceof Error ? error.message : error)
  }
}
