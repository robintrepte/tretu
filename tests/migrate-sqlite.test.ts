import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { closeTestDatabase, resetTestDatabase } from "./helpers/test-db";

import { eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import { actionJobs, authAccounts, dashboardSettings, gameInstances, tsUsers, userRoles, users } from "../src/db/schema";
import { migrateSqliteToPostgres, toDate } from "../scripts/migrate-sqlite-to-postgres";

const LEGACY_DIR = path.join(__dirname, "fixtures", "sqlite-legacy");
const T = 1_767_225_600; // 2026-01-01T00:00:00Z in unix seconds, as better-sqlite3/Drizzle stored it

let dir = "";
let sqlitePath = "";

/** Builds a SQLite file with the schema of the last SQLite release (its Drizzle migrations) and sample data. */
function buildLegacyDatabase(file: string) {
  const sqlite = new DatabaseSync(file);
  for (const name of readdirSync(LEGACY_DIR).sort()) {
    for (const statement of readFileSync(path.join(LEGACY_DIR, name), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  sqlite.exec(`
    INSERT INTO users (id, discord_id, display_name, avatar_url, created_at, updated_at) VALUES
      (1, '111111111111111111', 'Robin', 'https://cdn.discordapp.com/a.png', ${T}, ${T + 60}),
      (2, 'system:tretu-dashboard', 'Automatik', NULL, ${T}, ${T}),
      (7, '222222222222222222', 'Lukas', NULL, ${T}, ${T});
    INSERT INTO roles (id, key, created_at) VALUES (1, 'admin', ${T}), (2, 'operator', ${T}), (3, 'manager', ${T}), (4, 'user', ${T});
    INSERT INTO user_roles (user_id, role_id, created_at) VALUES (1, 1, ${T}), (7, 3, ${T});
    INSERT INTO game_instances (id, slug, name, game_type, region, desired_state, active_server_type, config_profile,
      idle_delete_after_minutes, created_at, updated_at, backup_on_hibernate, last_activity_at)
      VALUES (3, 'survival', 'Survival', 'minecraft', 'fsn1', 'offline', 'cx32', '{"settings":{"motd":"Hi"}}', 30, ${T}, ${T}, 0, ${T + 3600});
    INSERT INTO action_jobs (id, instance_id, action_type, requested_by_user_id, payload_json, status, idempotency_key, created_at, log)
      VALUES (12, 3, 'start', 1, '{"reason":"test"}', 'succeeded', 'k-12', ${T}, 'done');
    INSERT INTO game_backups (id, instance_id, file_name, size_bytes, kind, created_by_user_id, created_at)
      VALUES (5, 3, 'a.tar.gz', 5368709120, 'manuell', 1, ${T});
    INSERT INTO dashboard_settings (key, value, encrypted, updated_at) VALUES ('hetzner.location', 'nbg1', 0, ${T});
    INSERT INTO ts_rank_tiers (id, sort_order, name, min_total_seconds, server_group_id) VALUES (1, 0, 'Level 1', 0, 10);
    INSERT INTO ts_users (uuid, client_db_id, nickname, last_seen_at, total_online_seconds, period_online_seconds,
      period_idle_seconds, period_key, current_tier_id, excepted, is_online, updated_at)
      VALUES ('abc=', 4, 'Chris', ${T}, 3600, 60, 0, '2026-01', 1, 0, 1, ${T});
    INSERT INTO ts_server_snapshots (id, recorded_at, online_clients) VALUES (1, ${T}, 4), (2, ${T + 3600}, 6);
  `);
  sqlite.close();
}

test.before(async () => {
  await resetTestDatabase();
  dir = mkdtempSync(path.join(tmpdir(), "tretu-sqlite-"));
  sqlitePath = path.join(dir, "legacy.sqlite");
  buildLegacyDatabase(sqlitePath);
});

test.after(async () => {
  rmSync(dir, { recursive: true, force: true });
  await closeTestDatabase();
});

test("timestamps in seconds, milliseconds and text are converted", () => {
  assert.equal(toDate(T)?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(toDate(T * 1000)?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(toDate("2026-01-01 00:00:00")?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(toDate(null), null);
});

test("dry run copies nothing", async () => {
  const result = await migrateSqliteToPostgres(sqlitePath, { dryRun: true, quiet: true });
  assert.equal(result.mismatches, 0);
  const rows = await db.select().from(users);
  assert.equal(rows.length, 0);
});

test("copies all data with IDs, types and Better Auth links, and is idempotent", async () => {
  for (let run = 0; run < 2; run++) {
    const result = await migrateSqliteToPostgres(sqlitePath, { quiet: true });
    assert.equal(result.mismatches, 0, `run ${run}`);
  }

  const allUsers = await db.select().from(users).orderBy(users.id);
  assert.deepEqual(
    allUsers.map((u) => [u.id, u.discordId]),
    [
      [1, "111111111111111111"],
      [2, "system:tretu-dashboard"],
      [7, "222222222222222222"],
    ]
  );
  assert.equal(allUsers[0]!.createdAt.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(allUsers[0]!.updatedAt.toISOString(), "2026-01-01T00:01:00.000Z");
  assert.equal(allUsers[0]!.tretuSub, null);

  const roleRows = await db.select().from(userRoles);
  assert.equal(roleRows.length, 2);

  const [instance] = await db.select().from(gameInstances).where(eq(gameInstances.id, 3));
  assert.deepEqual(instance!.configProfile, { settings: { motd: "Hi" } });
  assert.equal(instance!.backupOnHibernate, false);
  assert.equal(instance!.lastActivityAt?.toISOString(), "2026-01-01T01:00:00.000Z");

  const [job] = await db.select().from(actionJobs).where(eq(actionJobs.id, 12));
  assert.deepEqual(job!.payloadJson, { reason: "test" });

  const [setting] = await db.select().from(dashboardSettings).where(eq(dashboardSettings.key, "hetzner.location"));
  assert.equal(setting!.value, "nbg1");
  assert.equal(setting!.encrypted, false);

  const [tsUser] = await db.select().from(tsUsers);
  assert.equal(tsUser!.isOnline, true);
  assert.equal(tsUser!.excepted, false);
  assert.equal(tsUser!.weekKey, "");

  const backup = await db.execute<{ size_bytes: string }>(sql`SELECT size_bytes::text FROM game_backups WHERE id = 5`);
  assert.equal(backup[0]!.size_bytes, "5368709120");

  // Discord users (not the system user) can log in through Better Auth and land on their old ID.
  const accounts = await db.select().from(authAccounts).orderBy(authAccounts.userId);
  assert.deepEqual(
    accounts.map((a) => [a.userId, a.providerId, a.accountId]),
    [
      [1, "discord", "111111111111111111"],
      [7, "discord", "222222222222222222"],
    ]
  );

  // Sequences continue after the highest copied ID.
  const [next] = await db.insert(users).values({ displayName: "Neu", discordId: "333" }).returning({ id: users.id });
  assert.equal(next!.id, 8);
});
