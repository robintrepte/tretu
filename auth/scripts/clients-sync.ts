import { db, sqlClient } from "@/lib/db"
import { env } from "@/lib/env"
import { parseClientsJson, syncClients } from "@/lib/oidc/clients"

/** npm run clients:sync — writes TRETU_OAUTH_CLIENTS_JSON into oauth_client (removed clients are disabled). */
const clients = parseClientsJson(env.TRETU_OAUTH_CLIENTS_JSON)
if (!clients.length) console.warn("[clients] TRETU_OAUTH_CLIENTS_JSON is empty: no clients to sync")
const result = await syncClients(db, clients)
console.log(`[clients] created: ${result.created.join(", ") || "–"}`)
console.log(`[clients] updated: ${result.updated.join(", ") || "–"}`)
console.log(`[clients] disabled: ${result.disabled.join(", ") || "–"}`)
await sqlClient.end()
