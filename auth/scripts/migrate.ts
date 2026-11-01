import { db, sqlClient } from "@/lib/db"
import { runMigrations } from "@/lib/db/migrate"

await runMigrations(db)
console.log("[migrate] database is up to date")
await sqlClient.end()
