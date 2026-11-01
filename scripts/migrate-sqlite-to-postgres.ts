/**
 * One-time copy of the old SQLite database (better-sqlite3 era) into Postgres.
 *
 *   npm run db:migrate-sqlite -- --sqlite ./local.sqlite [--dry-run]
 *
 * - Applies the Drizzle migrations first, so it works on an empty `tretu_web` database.
 * - Idempotent: rows are upserted by primary key, so running it again converges to the same state
 *   (rows that only exist in Postgres are kept).
 * - Preserves every ID, converts SQLite integers (unix seconds) to timestamptz, 0/1 to booleans and
 *   JSON text to jsonb, then resets every serial sequence to MAX(id).
 * - Links every Discord user to a Better Auth `auth_accounts` row, so existing users keep their ID and
 *   roles on their first login after the upgrade.
 * - Prints a row-count verification per table and exits with code 1 if Postgres has fewer rows.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getTableColumns, sql, type Column } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";

import { closeDb, db, type Tx } from "@/db";
import * as schema from "@/db/schema";
import { runMigrations } from "./db-migrate";

type SqliteRow = Record<string, unknown>;

/** Copy order respects foreign keys. */
const TABLES: PgTable[] = [
  schema.users,
  schema.roles,
  schema.userRoles,
  schema.gameInstances,
  schema.infraServers,
  schema.infraVolumes,
  schema.instancePorts,
  schema.actionJobs,
  schema.actionAttempts,
  schema.instanceStatusSnapshots,
  schema.backups,
  schema.gameBackups,
  schema.dashboardSettings,
  schema.auditEvents,
  schema.tsRankTiers,
  schema.tsUsers,
  schema.tsWorkerState,
  schema.tsServerSnapshots,
  schema.contacts,
];

const BATCH = 500;

function parseArgs(argv: string[]) {
  let sqlitePath = process.env.SQLITE_DATABASE_PATH ?? "local.sqlite";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--sqlite" && argv[i + 1]) sqlitePath = argv[++i]!;
  }
  return { sqlitePath: path.resolve(sqlitePath), dryRun };
}

/** SQLite stored Drizzle `timestamp` columns as unix seconds; tolerate milliseconds and date strings. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || typeof value === "bigint") {
    const n = Number(value);
    return new Date(Math.abs(n) > 1e11 ? n : n * 1000);
  }
  if (typeof value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(value)) return toDate(Number(value));
    const parsed = Date.parse(value.includes("T") || value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }
  return null;
}

export function convertValue(column: Column, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (column.columnType) {
    case "PgTimestamp":
      return toDate(value);
    case "PgBoolean":
      return value === true || value === 1 || value === "1" || value === "true";
    case "PgJsonb":
    case "PgJson":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      }
      return value;
    case "PgInteger":
    case "PgSerial":
    case "PgBigInt53":
      return Number(value);
    default:
      return typeof value === "bigint" ? Number(value) : value;
  }
}

function sqliteColumns(sqlite: DatabaseSync, table: string): Set<string> | null {
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return null;
  const rows = sqlite.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

async function copyTable(tx: Tx, sqlite: DatabaseSync, table: PgTable) {
  const config = getTableConfig(table);
  const columns = Object.entries(getTableColumns(table)) as Array<[string, PgColumn]>;
  const present = sqliteColumns(sqlite, config.name);
  if (!present) return { table: config.name, copied: 0, skipped: true };

  // Only columns that exist in the old database are copied; new columns keep their defaults.
  const copied = columns.filter(([, col]) => present.has(col.name));
  const primary = columns.filter(([, col]) => col.primary).map(([, col]) => col);
  const rows = sqlite.prepare(`SELECT * FROM "${config.name}"`).all() as SqliteRow[];

  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((row) =>
      Object.fromEntries(copied.map(([key, col]) => [key, convertValue(col, row[col.name])]))
    );
    const insert = tx.insert(table).values(values);
    if (primary.length === 1) {
      const set = Object.fromEntries(
        copied.filter(([, col]) => !col.primary).map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)])
      );
      await (Object.keys(set).length
        ? insert.onConflictDoUpdate({ target: primary[0]!, set })
        : insert.onConflictDoNothing());
    } else {
      // Composite keys (user_roles) only have a unique index.
      await insert.onConflictDoNothing();
    }
  }
  return { table: config.name, copied: rows.length, skipped: false };
}

async function resetSequences(tx: Tx) {
  for (const table of TABLES) {
    const { name } = getTableConfig(table);
    const serial = Object.values(getTableColumns(table)).find((col) => col.columnType === "PgSerial");
    if (!serial) continue;
    await tx.execute(
      sql.raw(
        `SELECT setval(pg_get_serial_sequence('"${name}"', '${serial.name}'), COALESCE((SELECT MAX("${serial.name}") FROM "${name}"), 0) + 1, false)`
      )
    );
  }
}

/** Better Auth finds existing users through their Discord account row (provider `discord`, account id = Discord ID). */
async function linkDiscordAccounts(tx: Tx): Promise<number> {
  const rows = await tx.execute<{ id: number }>(sql`
    INSERT INTO auth_accounts (user_id, account_id, provider_id, created_at, updated_at)
    SELECT id, discord_id, 'discord', now(), now() FROM users
    WHERE discord_id IS NOT NULL AND discord_id NOT LIKE 'system:%'
    ON CONFLICT (provider_id, account_id) DO NOTHING
    RETURNING id
  `);
  return rows.length;
}

export async function migrateSqliteToPostgres(sqlitePath: string, opts: { dryRun?: boolean; quiet?: boolean } = {}) {
  const log = opts.quiet ? () => undefined : console.log;
  if (!existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });

  await runMigrations();

  const results: Array<{ table: string; copied: number; skipped: boolean }> = [];
  let linked = 0;
  try {
    await db.transaction(async (tx) => {
      for (const table of TABLES) results.push(await copyTable(tx, sqlite, table));
      await resetSequences(tx);
      linked = await linkDiscordAccounts(tx);
      if (opts.dryRun) tx.rollback();
    });
  } catch (error) {
    // drizzle signals tx.rollback() with an error; a dry run ends here on purpose.
    if (!opts.dryRun) throw error;
  }

  log(`\n${opts.dryRun ? "DRY RUN (rolled back)" : "Copied"} from ${sqlitePath}\n`);
  log("table                        sqlite   postgres  status");
  let mismatches = 0;
  for (const { table, copied, skipped } of results) {
    if (skipped) {
      log(`${table.padEnd(28)} ${"–".padStart(7)} ${"".padStart(9)}  not in SQLite (skipped)`);
      continue;
    }
    const [{ count }] = (await db.execute<{ count: string }>(sql.raw(`SELECT count(*)::text AS count FROM "${table}"`))) as unknown as [
      { count: string },
    ];
    const pg = Number(count);
    const ok = opts.dryRun ? true : pg >= copied;
    if (!ok) mismatches++;
    const status = opts.dryRun ? "dry run" : pg === copied ? "OK" : pg > copied ? "OK (extra rows in Postgres)" : "MISMATCH";
    log(`${table.padEnd(28)} ${String(copied).padStart(7)} ${String(pg).padStart(9)}  ${status}`);
  }
  log(`\nDiscord accounts linked for Better Auth: ${linked}`);
  sqlite.close();
  return { results, linked, mismatches };
}

async function main() {
  const { sqlitePath, dryRun } = parseArgs(process.argv.slice(2));
  const { mismatches } = await migrateSqliteToPostgres(sqlitePath, { dryRun });
  if (mismatches) {
    console.error(`\n${mismatches} table(s) have fewer rows in Postgres than in SQLite.`);
    process.exitCode = 1;
  } else {
    console.log("\nVerification passed.");
  }
}

if (process.argv[1] && /migrate-sqlite-to-postgres\.ts$/.test(process.argv[1])) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => void closeDb());
}
