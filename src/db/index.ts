import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { DATABASE_URL } from "@/lib/env/server";
import * as schema from "./schema";

type PgClient = ReturnType<typeof postgres>;

/** One pool per process (survives Next.js dev hot reloads). Connects lazily on the first query. */
const globalForDb = globalThis as unknown as { __tretuPg?: PgClient };

export const client: PgClient = (globalForDb.__tretuPg ??= postgres(DATABASE_URL, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => undefined,
}));

export const db = drizzle(client, { schema });

export type Db = typeof db;
/** Transaction handle passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pool or an open transaction. */
export type DbOrTx = Db | Tx;

/** Closes the pool so CLI scripts can exit. */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
  globalForDb.__tretuPg = undefined;
}
