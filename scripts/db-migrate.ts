import path from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDb, db } from "@/db";
import { DATABASE_URL } from "@/lib/env/server";

/** Applies all pending migrations from `drizzle/` (idempotent; tracked in `drizzle.__drizzle_migrations`). */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}

async function main() {
  console.log(`Migrating ${DATABASE_URL.replace(/\/\/[^@]*@/, "//***@")} …`);
  await runMigrations();
  console.log("Database is up to date.");
}

if (process.argv[1] && /db-migrate\.ts$/.test(process.argv[1])) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => void closeDb());
}
