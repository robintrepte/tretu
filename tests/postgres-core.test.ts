import assert from "node:assert/strict";
import test from "node:test";

import { closeTestDatabase, resetTestDatabase } from "./helpers/test-db";

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { actionJobs, gameInstances, users } from "../src/db/schema";
import { healthReport } from "../src/lib/health";
import { cancelQueuedJobs, createJobContext, enqueueJob, systemUserId } from "../src/lib/orchestrator/jobs";
import { acquireLease } from "../src/lib/orchestrator/worker";
import { getPermissions, getRolesForUsers, grantRole, hasPermission, setUserRoles } from "../src/lib/permissions/checks";
import { getJsonSetting, getSetting, setJsonSetting, setSetting } from "../src/lib/settings/store";

let userId = 0;
let instanceId = 0;

test.before(async () => {
  await resetTestDatabase();
  const [user] = await db.insert(users).values({ discordId: "42", displayName: "Tester" }).returning();
  userId = user!.id;
  const [instance] = await db
    .insert(gameInstances)
    .values({ slug: "mc", name: "MC", gameType: "minecraft", activeServerType: "cx22" })
    .returning();
  instanceId = instance!.id;
});

test.after(async () => {
  await closeTestDatabase();
});

test("roles: grant, replace atomically, resolve permissions", async () => {
  assert.equal(await hasPermission(userId, "dashboard:view"), false);
  await grantRole(userId, "manager");
  await grantRole(userId, "manager");
  assert.equal(await hasPermission(String(userId), "instances:start"), true);
  assert.equal(await hasPermission(userId, "instances:delete"), false);

  await setUserRoles(userId, ["operator", "operator", "admin"]);
  assert.deepEqual((await getRolesForUsers([userId])).get(userId)?.sort(), ["admin", "operator"]);
  assert.ok((await getPermissions(userId)).includes("roles:manage"));

  await setUserRoles(userId, []);
  assert.deepEqual(await getPermissions(userId), []);
  assert.equal(await hasPermission("not-a-number", "dashboard:view"), false);
});

test("jobs: idempotency key, de-duplication of queued actions, cancel", async () => {
  const first = await enqueueJob({ instanceId, actionType: "start", userId, idempotencyKey: "same" });
  const again = await enqueueJob({ instanceId, actionType: "start", userId, idempotencyKey: "same" });
  assert.equal(again.jobId, first.jobId);
  assert.equal(again.deduplicated, true);

  const queuedTwice = await enqueueJob({ instanceId, actionType: "start", userId });
  assert.equal(queuedTwice.jobId, first.jobId);

  const backupA = await enqueueJob({ instanceId, actionType: "backup", userId });
  const backupB = await enqueueJob({ instanceId, actionType: "backup", userId });
  assert.notEqual(backupA.jobId, backupB.jobId, "backups are stackable");

  // Concurrent requests with one idempotency key create exactly one job.
  const results = await Promise.all(
    Array.from({ length: 5 }, () => enqueueJob({ instanceId, actionType: "restore", userId, idempotencyKey: "race" }))
  );
  assert.equal(new Set(results.map((r) => r.jobId)).size, 1);

  await cancelQueuedJobs(instanceId, backupA.jobId);
  const rows = await db.select().from(actionJobs).where(eq(actionJobs.instanceId, instanceId));
  assert.equal(rows.find((r) => r.id === backupA.jobId)?.status, "queued");
  assert.equal(rows.find((r) => r.id === first.jobId)?.status, "cancelled");
});

test("job context writes log lines in order and keeps the tail", async () => {
  const { jobId } = await enqueueJob({ instanceId, actionType: "apply", userId });
  const ctx = createJobContext(jobId, userId);
  ctx.step("Schritt 1");
  for (let i = 0; i < 50; i++) ctx.log(`line ${i}`);
  ctx.output("raw \x1b[31mred\x1b[0m output\r");
  await ctx.flush();
  const [job] = await db.select().from(actionJobs).where(eq(actionJobs.id, jobId));
  assert.equal(job!.progress, "Schritt 1");
  const log = job!.log;
  assert.ok(log.indexOf("line 0") < log.indexOf("line 49"));
  assert.ok(log.includes("raw red output\n"));
});

test("system user is created once", async () => {
  const [a, b] = await Promise.all([systemUserId(), systemUserId()]);
  assert.equal(a, b);
  assert.equal(await systemUserId(), a);
});

test("settings: plain, secret (encrypted at rest) and JSON values", async () => {
  await setSetting("hetzner.location", "nbg1");
  assert.equal(await getSetting("hetzner.location"), "nbg1");
  await setSetting("hetzner.token", "very-secret-token", { secret: true });
  assert.equal(await getSetting("hetzner.token"), "very-secret-token");
  await setJsonSetting("cache.test", { a: 1 });
  assert.deepEqual(await getJsonSetting("cache.test"), { a: 1 });
  await setSetting("hetzner.location", null);
  assert.equal(await getSetting("hetzner.location"), null);
});

test("worker lease: one owner at a time, renewable by its owner", async () => {
  assert.equal(await acquireLease("host-a"), true);
  assert.equal(await acquireLease("host-b"), false);
  assert.equal(await acquireLease("host-a"), true);
});

test("health report", async () => {
  const report = await healthReport();
  assert.equal(report.status, "ok");
  assert.equal(report.app, "tretu-web");
  assert.equal(report.checks.db, "ok");
  assert.match(report.version, /^\d+\.\d+\.\d+/);
  assert.ok(!Number.isNaN(Date.parse(report.time)));
  assert.equal(report.checks.migrations, "ok");
  assert.equal(report.checks.worker, "off", "platform not configured");
  assert.ok(!JSON.stringify(report).includes("postgres://"), "no connection details");
});

test("health report: pending migrations fail it, an overdue platform backlog marks the worker stale", async () => {
  const { sql } = await import("drizzle-orm");
  process.env.TRETU_APPS_JSON = JSON.stringify({ saga: { secret: "s", webhook: "https://saga.test/api/tretu/webhook" } });
  try {
    assert.equal((await healthReport()).checks.worker, "ok");
    await db.execute(sql`insert into platform_jobs (type, payload, next_attempt_at) values ('user.fetch', '{}', now() - interval '11 minutes')`);
    const stale = await healthReport();
    assert.equal(stale.checks.worker, "stale");
    assert.equal(stale.status, "ok", "the site itself still works");
    await db.execute(sql`update platform_jobs set locked_until = now() + interval '1 minute'`);
    assert.equal((await healthReport()).checks.worker, "ok", "being worked on");
    await db.execute(sql`delete from platform_jobs`);

    // A webhook row of an app without a webhook waits on purpose (parked); one of saga is overdue work.
    const insertRow = (app: string) =>
      db.execute(sql`insert into platform_outbox (event_id, target_app, type, payload, next_attempt_at)
                     values (gen_random_uuid(), ${app}, 'level.up', '{}', now() - interval '2 days')`);
    await insertRow("play");
    assert.equal((await healthReport()).checks.worker, "ok", "parked rows are not overdue");
    await insertRow("saga");
    assert.equal((await healthReport()).checks.worker, "stale");
    await db.execute(sql`delete from platform_outbox`);

    const [last] = (await db.execute(sql`select id from drizzle.__drizzle_migrations order by id desc limit 1`)) as unknown as { id: number }[];
    await db.execute(sql`delete from drizzle.__drizzle_migrations where id = ${last.id}`);
    const pending = await healthReport();
    assert.deepEqual([pending.status, pending.checks.migrations], ["error", "pending"]);
  } finally {
    delete process.env.TRETU_APPS_JSON;
    await resetTestDatabase();
  }
});
