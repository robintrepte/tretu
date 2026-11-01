import path from "node:path"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type { Db } from "./index"

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") })
}
