import { drizzle, type PostgresJsDatabase, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres, { type Sql } from "postgres";

import * as schema from "@/db/platform-schema";

export type PlatformSchema = typeof schema;
export type PlatformDb = PostgresJsDatabase<PlatformSchema>;
/** Root database or a transaction: every platform function accepts either. */
export type Executor = PgDatabase<PostgresJsQueryResultHKT, PlatformSchema>;

type Holder = { db: PlatformDb; client: Sql; url: string };
const globalForDb = globalThis as unknown as { __tretuPlatformDb?: Holder };

export class PlatformDbUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set; the Tretu platform is disabled.");
    this.name = "PlatformDbUnavailableError";
  }
}

export function isPlatformDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function create(url: string): Holder {
  const max = Number(process.env.PLATFORM_DB_POOL_MAX ?? 10);
  const client = postgres(url, {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return { client, url, db: drizzle(client, { schema }) };
}

/** Lazily connects on first use so `next build` works without a database. */
export function getPlatformDb(): PlatformDb {
  const url = process.env.DATABASE_URL;
  if (!url) throw new PlatformDbUnavailableError();
  const existing = globalForDb.__tretuPlatformDb;
  if (existing && existing.url === url) return existing.db;
  const holder = create(url);
  globalForDb.__tretuPlatformDb = holder;
  return holder.db;
}

/** Drizzle client for the platform tables (lazy proxy around {@link getPlatformDb}). */
export const platformDb: PlatformDb = new Proxy({} as PlatformDb, {
  get(_target, prop) {
    const db = getPlatformDb();
    const value = Reflect.get(db, prop, db) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(db) : value;
  },
});

export async function closePlatformDb(): Promise<void> {
  const holder = globalForDb.__tretuPlatformDb;
  globalForDb.__tretuPlatformDb = undefined;
  if (holder) await holder.client.end({ timeout: 5 });
}

/** Postgres error code of a driver error (e.g. `23505` unique violation, `40P01` deadlock). */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Runs `work` in a transaction and retries on deadlocks / serialization failures. */
export async function inTransaction<T>(
  db: Executor,
  work: (tx: Executor) => Promise<T>,
  attempts = 4
): Promise<T> {
  // Inside an outer transaction this becomes a savepoint; a deadlock aborts the outer one anyway.
  const nested = "rollback" in db;
  if (nested) return db.transaction((tx) => work(tx));
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction((tx) => work(tx));
    } catch (error) {
      const code = pgErrorCode(error);
      if (attempt < attempts && (code === "40P01" || code === "40001")) {
        await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
        continue;
      }
      throw error;
    }
  }
}
