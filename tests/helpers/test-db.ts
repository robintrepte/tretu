/**
 * Points every DB-using module at the Postgres test database. Import this FIRST in a test file
 * (before anything that imports `@/db`). Override with TEST_DATABASE_URL.
 *
 * Tests run one file at a time (`--test-concurrency=1`), each file resets the schema it needs.
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_web_test";
process.env.DATABASE_POOL_MAX ??= "3";

export const TEST_DATABASE_URL = process.env.DATABASE_URL;

/** Drops everything and applies the Drizzle migrations from `drizzle/`. */
export async function resetTestDatabase(): Promise<void> {
  const { db } = await import("../../src/db");
  const { sql } = await import("drizzle-orm");
  const { runMigrations } = await import("../../scripts/db-migrate");
  await db.execute(sql.raw("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"));
  await runMigrations();
}

export async function closeTestDatabase(): Promise<void> {
  const { closeDb } = await import("../../src/db");
  await closeDb();
}
