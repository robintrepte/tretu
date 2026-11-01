import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "@/lib/env"
import * as schema from "./schema"

export function createDb(url: string = env.DATABASE_URL, max = 10) {
  const client = postgres(url, { max, onnotice: () => {}, connect_timeout: 10 })
  return { client, db: drizzle(client, { schema, casing: "snake_case" }) }
}

export type Db = ReturnType<typeof createDb>["db"]

// Dev reloads and route bundles share one process: reuse a single pool.
const globalForDb = globalThis as unknown as { __tretuAuthDb?: ReturnType<typeof createDb> }
const instance = (globalForDb.__tretuAuthDb ??= createDb())

export const db = instance.db
export const sqlClient = instance.client
export { schema }
