/**
 * Test helpers: a dedicated Postgres database (default `tretu_platform_test`, override with
 * TRETU_PLATFORM_TEST_DATABASE_URL), schema created from src/db/platform-schema.ts, truncated per test.
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";

const TEST_URL =
  process.env.TRETU_PLATFORM_TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_platform_test";
process.env.DATABASE_URL = TEST_URL;
process.env.PLATFORM_DB_POOL_MAX = "20";
(process.env as Record<string, string>).NODE_ENV = "test";

export const TEST_APPS = {
  saga: { secret: "saga-secret-0123456789abcdef", webhook: "https://saga.test/api/tretu/webhook" },
  play: { secret: "play-secret-0123456789abcdef", webhook: "https://play.test/api/tretu/webhook?x=1" },
  hollowmere: { secret: "hollowmere-secret-0123456789" },
  "mc-dashboard": { secret: "mc-secret-0123456789abcdef" },
  auth: { secret: "auth-secret-0123456789abcdef" },
  "tretu-web": { secret: "web-secret-0123456789abcdef" },
};
process.env.TRETU_APPS_JSON = JSON.stringify(TEST_APPS);

let prepared: Promise<void> | null = null;

async function createDatabaseIfMissing(): Promise<void> {
  const url = new URL(TEST_URL);
  const name = url.pathname.slice(1);
  const admin = postgres({ host: url.hostname, port: Number(url.port || 5432), user: url.username || "postgres", database: "postgres", onnotice: () => {} });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${name}`;
    if (!rows.length) await admin.unsafe(`create database "${name.replace(/"/g, "")}"`);
  } finally {
    await admin.end();
  }
}

async function applySchema(): Promise<void> {
  const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
  const schema = await import("../../src/db/platform-schema");
  const empty = generateDrizzleJson({});
  const target = generateDrizzleJson(schema as Record<string, unknown>);
  const statements = await generateMigration(empty, target);
  const sql = postgres(TEST_URL, { onnotice: () => {}, max: 1 });
  try {
    await sql.unsafe("drop schema if exists public cascade; create schema public;");
    for (const statement of statements) await sql.unsafe(statement);
  } finally {
    await sql.end();
  }
}

/** Creates the test database and schema once per test file. */
export function prepareDatabase(): Promise<void> {
  prepared ??= (async () => {
    await createDatabaseIfMissing();
    await applySchema();
  })();
  return prepared;
}

export async function resetDatabase(): Promise<void> {
  await prepareDatabase();
  const { PLATFORM_TABLE_NAMES } = await import("../../src/db/platform-schema");
  const { platformDb } = await import("../../src/lib/platform/db");
  const { sql } = await import("drizzle-orm");
  await platformDb.execute(sql.raw(`truncate ${PLATFORM_TABLE_NAMES.join(", ")} restart identity cascade`));
  const { appRateLimiter, userRateLimiter } = await import("../../src/lib/platform/http");
  appRateLimiter.reset();
  userRateLimiter.reset();
}

export async function closeDatabase(): Promise<void> {
  const { closePlatformDb } = await import("../../src/lib/platform/db");
  await closePlatformDb();
}

export function uuid(): string {
  return randomUUID();
}

/** A signed Request for calling route handlers directly. */
export async function signedRequest(
  app: keyof typeof TEST_APPS | string,
  method: string,
  pathWithQuery: string,
  body?: unknown,
  options: { secret?: string; now?: Date } = {}
): Promise<Request> {
  const { signedHeaders } = await import("../../src/lib/platform/signing");
  const raw = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const secret = options.secret ?? (TEST_APPS as Record<string, { secret: string }>)[app]?.secret ?? "unknown";
  const headers = signedHeaders(app, secret, { method, pathWithQuery, body: raw }, options.now);
  return new Request(`http://localhost:3020${pathWithQuery}`, {
    method,
    headers: { ...headers, ...(raw ? { "content-type": "application/json" } : {}) },
    body: raw || undefined,
  });
}

export function ctx<P extends Record<string, string>>(params: P = {} as P) {
  return { params: Promise.resolve(params) };
}

/** Inserts a directory user directly (as if user.created was processed). */
export async function seedUser(sub: string, username: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { platformDb } = await import("../../src/lib/platform/db");
  const { upsertDirectoryUser } = await import("../../src/lib/platform/directory");
  await upsertDirectoryUser(platformDb, { sub, username, name: username, roles: [], ...extra } as never, new Date(0));
}

export function envelope(app: string, sub: string | null, type: string, data: Record<string, unknown>, occurredAt = new Date()) {
  return { id: uuid(), type, app, sub, occurredAt: occurredAt.toISOString(), data };
}
