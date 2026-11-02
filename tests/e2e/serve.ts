/**
 * Test server for the Playwright suite: fresh database `tretu_web_test_e2e` (override E2E_DATABASE_URL),
 * migrations, seed data (profiles with linked accounts, a signed-in owner who is a Tretu admin, a team member without
 * it, status history), the mocked auth admin API on E2E_AUTH_PORT (default 3133), then `next start`.
 * While it runs, it stands in for the platform worker's status checks (one result per service every 30 s).
 */
import { spawn } from "node:child_process";
import path from "node:path";

import postgres from "postgres";

import { mockUser, startMockAuth } from "../helpers/mock-auth-admin";
import {
  AUTH_MOCK_PORT,
  AUTH_MOCK_URL,
  E2E_SECRET,
  MEMBER_SESSION_TOKEN,
  MEMBER_SUB,
  NO2FA_SESSION_TOKEN,
  NO2FA_SUB,
  SESSION_TOKEN,
  STATUS_SEED,
  STATUS_TARGETS,
  STEAM_ID,
  TS_UID,
  USERS,
  WEB_SECRET,
} from "./fixtures";

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

  // The owner is a Tretu admin (roles claim → local admin, tracked as `tretu`): the central admin is open to them.
  const [owner] = await db.insert(users).values({ displayName: USERS.owner.name, tretuSub: USERS.owner.sub, tretuRoles: ["admin"] }).returning();
  await db.insert(authSessions).values({ token: SESSION_TOKEN, userId: owner!.id, expiresAt: new Date(Date.now() + 24 * 3600_000) });
  const { grantRoleWithSource } = await import("../../src/lib/auth/tretu-account");
  await grantRoleWithSource(db, owner!.id, "admin", "tretu");
  // A game-server operator without the Tretu admin role.
  const [member] = await db.insert(users).values({ displayName: "Member", tretuSub: MEMBER_SUB, tretuRoles: [] }).returning();
  await db.insert(authSessions).values({ token: MEMBER_SESSION_TOKEN, userId: member!.id, expiresAt: new Date(Date.now() + 24 * 3600_000) });
  await grantRoleWithSource(db, member!.id, "operator", "local");
  // A Tretu admin without 2FA at auth (the overview explains why the account admin stays closed).
  const [no2fa] = await db.insert(users).values({ displayName: "Neu-Admin", tretuSub: NO2FA_SUB, tretuRoles: ["admin"] }).returning();
  await db.insert(authSessions).values({ token: NO2FA_SESSION_TOKEN, userId: no2fa!.id, expiresAt: new Date(Date.now() + 24 * 3600_000) });
  await grantRoleWithSource(db, no2fa!.id, "admin", "tretu");
  await seedStatus();
  await closePlatformDb();
  await closeDb();
}

const statusResult = (state: "up" | "degraded" | "down", users?: [number, number | null]) =>
  state === "up"
    ? { state, responseMs: 87, httpStatus: 200, error: null, usersOnline: users?.[0] ?? null, usersMax: users?.[1] ?? null }
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
      await recordCheck(platformDb, service, statusResult(hour === 2 ? seed.now : "up", seed.users), new Date(now - hour * 3600_000));
    }
    await recordCheck(platformDb, service, statusResult(seed.now, seed.users), new Date(now - 60_000));
  }
}

/** Keeps the seeded states fresh, like the platform worker (so the page never shows "stale" during the run). */
function keepStatusFresh() {
  const refresh = async () => {
    const { platformDb } = await import("../../src/lib/platform/db");
    const { recordCheck } = await import("../../src/lib/status/store");
    for (const [service, seed] of Object.entries(STATUS_SEED)) await recordCheck(platformDb, service, statusResult(seed.now, seed.users), new Date());
  };
  const timer = setInterval(() => {
    refresh().catch((error: unknown) => console.error("status refresh failed", error));
  }, 30_000);
  timer.unref();
}

/** auth.tretu.de admin API stand-in (signature-checked, in memory) for the central admin flows. */
async function startAuthMock() {
  const at = "2026-01-01T00:00:00.000Z";
  await startMockAuth({
    secret: WEB_SECRET,
    port: AUTH_MOCK_PORT,
    users: [
      mockUser({ sub: USERS.owner.sub, username: USERS.owner.username, name: USERS.owner.name, email: "robin@example.org", emailVerified: true, roles: ["admin"], twoFactor: true, createdAt: at }),
      mockUser({
        sub: USERS.steamy.sub,
        username: USERS.steamy.username,
        name: USERS.steamy.name,
        email: "steamy@example.org",
        emailVerified: true,
        createdAt: at,
        lastSignInAt: "2026-10-30T12:00:00.000Z",
        links: { steam: STEAM_ID, discord: "424242", minecraftName: "SteamyMC", minecraft: "uuid-steamy", teamspeak: TS_UID },
        providers: [
          { provider: "steam", accountId: STEAM_ID, displayName: "Steamy", createdAt: at },
          { provider: "discord", accountId: "424242", displayName: "steamy", createdAt: at },
        ],
        sessions: [{ id: "sess-1", createdAt: "2026-10-30T12:00:00.000Z", expiresAt: "2099-12-30T12:00:00.000Z", ipAddress: "203.0.113.9", client: "play" }],
      }),
      mockUser({ sub: USERS.hidden.sub, username: USERS.hidden.username, name: USERS.hidden.name, createdAt: at }),
      mockUser({ sub: NO2FA_SUB, username: "neuadmin", name: "Neu-Admin", roles: ["admin"], twoFactor: false, createdAt: at }),
    ],
  });
}

async function main() {
  await resetDatabase();
  await seed();
  await startAuthMock();
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
      TRETU_APPS_JSON: JSON.stringify({ "tretu-web": { secret: WEB_SECRET } }),
      TRETU_AUTH_ISSUER: AUTH_MOCK_URL,
      TRETU_APP_SECRET: WEB_SECRET,
      TS_QUERY_HOST: "127.0.0.1",
      TS_QUERY_USER: "serveradmin",
      TS_QUERY_PASSWORD: "e2e",
      // Status page: the services the seed wrote history for (never called by the page) and a maintenance note.
      TRETU_STATUS_TARGETS_JSON: JSON.stringify(STATUS_TARGETS),
      TRETU_STATUS_MINECRAFT: "mc.tretu.de:25565",
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
