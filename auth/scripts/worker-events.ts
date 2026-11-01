import { sql } from "drizzle-orm"
import { db, sqlClient } from "@/lib/db"
import { platformEnabled } from "@/lib/env"
import { deliverPending } from "@/lib/tretu/events"

/**
 * npm run worker:events — delivers the event outbox to the platform (contract §4), forever.
 * PM2 process `tretu-auth-events`. Idle while TRETU_PLATFORM_URL / TRETU_APP_SECRET are missing.
 */
const INTERVAL_MS = 5000
let stopping = false
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => (stopping = true))

if (!platformEnabled) console.info("[events] TRETU_PLATFORM_URL / TRETU_APP_SECRET not set: events stay in the outbox")
let lastCleanup = 0
while (!stopping) {
  try {
    if (platformEnabled) {
      let result
      do result = await deliverPending(db, { limit: 100 })
      while (result.delivered === 100 && !stopping)
    }
    if (Date.now() - lastCleanup > 3_600_000) {
      // Delivered events are kept 30 days for debugging.
      await db.execute(sql`delete from event_outbox where delivered_at < now() - interval '30 days'`)
      lastCleanup = Date.now()
    }
  } catch (error) {
    console.error("[events]", error instanceof Error ? error.message : error)
  }
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
}
await sqlClient.end()
