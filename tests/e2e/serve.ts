/**
 * Test server for the Playwright suite: fresh database `tretu_web_test_e2e` (override E2E_DATABASE_URL),
 * migrations, seed data (profiles with linked accounts, a signed-in owner, status history), then `next start`.
 * While it runs, it stands in for the platform worker's status checks (one result per service every 30 s).
 */
import { spawn } from "node:child_process";
import path from "node:path";

import postgres from "postgres";

import { E2E_SECRET, SESSION_TOKEN, STATUS_SEED, STATUS_TARGETS, STEAM_ID, TS_UID, USERS } from "./fixtures";

const root = path.resolve(__dirname, "../..");
const port = process.env.E2E_PORT ?? "3132";
const database = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_web_test_e2e";
const admin = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres";

async function resetDatabase() {
  const name = new URL(database).pathname.slice(1);
  const sql = postgres(admin, { max: 1, onnotice: () => {} });
  await sql.unsafe(`drop database if exists "${name}" with (force)`);
  await sql.unsafe(`create database "${name}"`);
  await sql.end();
}

async function seed() {
  process.env.DATABASE_URL = database;
  const { runMigrations } = await import("../../scripts/db-migrate");
  await runMigrations();
  const { db, closeDb } = await import("../../src/db");
  const { authSessions, users } = await import("../../src/db/schema");
  const { platformDb, closePlatformDb } = await import("../../src/lib/platform/db");
  const { authUserSchema, upsertDirectoryUser } = await import("../../src/lib/platform/directory");
  const user = (value: unknown) => authUserSchema.parse(value);
  const { platformTsLinks } = await import("../../src/db/platform-schema");
  const { setVisibility } = await import("../../src/lib/platform/profile");

  const at = new Date("2026-01-01T00:00:00Z");
  await upsertDirectoryUser(platformDb, user({ ...USERS.steamy, links: { steam: STEAM_ID, discord: "424242", minecraftName: "SteamyMC", teamspeak: TS_UID } }), at);
  await upsertDirectoryUser(platformDb, user({ ...USERS.hidden, links: { steam: STEAM_ID } }), at);
  await upsertDirectoryUser(platformDb, user({ ...USERS.owner, links: {} }), at);
  await platformDb.insert(platformTsLinks).values({ sub: USERS.steamy.sub, tsUid: TS_UID, tsClientDbId: 77, tsNickname: "Steamy", verifiedAt: at });
  // The owner's last TeamSpeak link was refused by auth (shown on /einstellungen#teamspeak).
  await platformDb.insert(platformTsLinks).values({ sub: USERS.owner.sub, linkError: "ts_identity_taken_auth" });
  await setVisibility(platformDb, USERS.hidden.sub, "friends");

  const [owner] = await db.insert(users).values({ displayName: USERS.owner.name, tretuSub: USERS.owner.sub }).returning();
  await db.insert(authSessions).values({ token: SESSION_TOKEN, userId: owner!.id, expiresAt: new Date(Date.now() + 24 * 3600_000) });
  await seedStatus();
  await closePlatformDb();
  await closeDb();
}

const statusResult = (state: "up" | "degraded" | "down") =>
  state === "up"
    ? { state, responseMs: 87, httpStatus: 200, error: null }
    : state === "degraded"
      ? { state, responseMs: 240, httpStatus: 503, error: "checks:db" }
      : { state, responseMs: null, httpStatus: null, error: "timeout" };

/** 90 days and 24 hours of history for every seeded service, oldest first (as the worker would have written it). */
async function seedStatus() {
  const { platformDb } = await import("../../src/lib/platform/db");
  const { recordCheck } = await import("../../src/lib/status/store");
  const now = Date.now();
  for (const [service, seed] of Object.entries(STATUS_SEED)) {
    for (let day = 89; day >= 1; day--) {
      const state = day === 3 && seed.badDay ? "down" : "up";
      await recordCheck(platformDb, service, statusResult(state), new Date(now - day * 24 * 3600_000));
    }
    for (let hour = 23; hour >= 1; hour--) {
      await recordCheck(platformDb, service, statusResult(hour === 2 ? seed.now : "up"), new Date(now - hour * 3600_000));
    }
    await recordCheck(platformDb, service, statusResult(seed.now), new Date(now - 60_000));
  }
}

/** Keeps the seeded states fresh, like the platform worker (so the page never shows "stale" during the run). */
function keepStatusFresh() {
  const refresh = async () => {
    const { platformDb } = await import("../../src/lib/platform/db");
    const { recordCheck } = await import("../../src/lib/status/store");
    for (const [service, seed] of Object.entries(STATUS_SEED)) await recordCheck(platformDb, service, statusResult(seed.now), new Date());
  };
  const timer = setInterval(() => {
    refresh().catch((error: unknown) => console.error("status refresh failed", error));
  }, 30_000);
  timer.unref();
}

async function main() {
  await resetDatabase();
  await seed();
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", port], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: database,
      AUTH_SECRET: E2E_SECRET,
      BETTER_AUTH_URL: `http://localhost:${port}`,
      ORCHESTRATOR_EMBEDDED: "false",
      AUTH_RATE_LIMIT: "off",
      // Platform on (signed API) with a Tretu-Konto issuer for the "Mein Konto" / "Steam verbinden" links.
      TRETU_APPS_JSON: JSON.stringify({ "tretu-web": { secret: "e2e-web-secret-0123456789" } }),
      TRETU_AUTH_ISSUER: "http://127.0.0.1:9",
      TS_QUERY_HOST: "127.0.0.1",
      TS_QUERY_USER: "serveradmin",
      TS_QUERY_PASSWORD: "e2e",
      // Status page: the services the seed wrote history for (never called by the page) and a maintenance note.
      TRETU_STATUS_TARGETS_JSON: JSON.stringify(STATUS_TARGETS),
      TRETU_STATUS_NOTICE: "Wartung am Sonntag ab 22 Uhr",
    },
  });
  keepStatusFresh();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
