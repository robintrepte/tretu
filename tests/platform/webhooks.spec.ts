import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { closeDatabase, resetDatabase, TEST_APPS, uuid } from "./helpers";
import { platformJobs, platformOutbox } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { runDueJobs } from "../../src/lib/platform/jobs";
import {
  deliverDueWebhooks,
  emitPlatformEvent,
  expireParkedWebhooks,
  nextAttemptAt,
  outboxSummary,
  PARKED_MAX_AGE_MS,
  retryDelayMs,
  retryOutbox,
  retrySchedule,
  WEBHOOK_MAX_AGE_MS,
} from "../../src/lib/platform/outbox";
import { parseOutboxArgs, runOutboxCommand } from "../../src/lib/platform/outbox-cli";
import { verifySignature } from "../../src/lib/platform/signing";

beforeEach(resetDatabase);
after(closeDatabase);

type Captured = { url: string; headers: Record<string, string>; body: string };

function receiver(statusFor: (url: string, n: number) => number) {
  const calls: Captured[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response(null, { status: statusFor(url, calls.length) });
  };
  return { calls, fetchImpl };
}

test("retry schedule: exponential from 30 s, capped at 2 h, gives up after 24 h", () => {
  assert.equal(retryDelayMs(1), 30_000);
  assert.equal(retryDelayMs(2), 60_000);
  assert.equal(retryDelayMs(3), 120_000);
  assert.equal(retryDelayMs(9), 2 * 3600_000);
  assert.equal(retryDelayMs(50), 2 * 3600_000);
  const schedule = retrySchedule();
  assert.equal(schedule[0], 0);
  assert.ok(schedule.every((t, i) => i === 0 || t > schedule[i - 1]));
  assert.ok(schedule[schedule.length - 1] <= WEBHOOK_MAX_AGE_MS);
  assert.ok(schedule[schedule.length - 1] + 2 * 3600_000 > WEBHOOK_MAX_AGE_MS);
  const created = new Date(0);
  assert.equal(nextAttemptAt(created, 3, new Date(WEBHOOK_MAX_AGE_MS - 1000)), null);
});

test("events are queued per subscribed app and delivered signed with the receiving app's secret", async () => {
  const sub = uuid();
  await platformDb.transaction((tx) => emitPlatformEvent(tx, { type: "badge.earned", sub, data: { badge: "wins-10", title: "Siegesserie", xp: 100, credits: 25 } }));
  const rows = await platformDb.select().from(platformOutbox);
  // Every receiving app gets a row (auth and tretu-web don't); hollowmere and mc-dashboard have no webhook yet.
  assert.deepEqual(rows.map((r) => r.targetApp).sort(), ["hollowmere", "mc-dashboard", "play", "saga"]);
  assert.equal(new Set(rows.map((r) => r.eventId)).size, 1);

  const { calls, fetchImpl } = receiver(() => 204);
  const now = new Date();
  const stats = await deliverDueWebhooks({ now, fetchImpl });
  assert.deepEqual(stats, { delivered: 2, retried: 0, failed: 0 });

  for (const call of calls) {
    const app = call.url.startsWith("https://saga.test") ? "saga" : "play";
    const url = new URL(call.url);
    assert.equal(call.headers["x-tretu-app"], "platform");
    const verdict = verifySignature(
      TEST_APPS[app].secret,
      {
        timestamp: call.headers["x-tretu-timestamp"],
        method: "POST",
        pathWithQuery: url.pathname + url.search,
        body: call.body,
        signature: call.headers["x-tretu-signature"],
      },
      now
    );
    assert.deepEqual(verdict, { ok: true }, `signature for ${app}`);
    const payload = JSON.parse(call.body);
    assert.equal(payload.app, "platform");
    assert.equal(payload.type, "badge.earned");
    assert.equal(payload.sub, sub);
    assert.deepEqual(payload.data, { badge: "wins-10", title: "Siegesserie", xp: 100, credits: 25 });
  }
  // Nothing due anymore.
  assert.deepEqual(await deliverDueWebhooks({ now, fetchImpl }), { delivered: 0, retried: 0, failed: 0 });
});

test("failed deliveries are retried with backoff and given up after 24 h", async () => {
  const t0 = new Date("2026-05-01T08:00:00Z");
  await emitPlatformEvent(platformDb, { type: "level.up", sub: uuid(), data: { level: 3 }, now: t0 });
  // play is down, saga works.
  const { calls, fetchImpl } = receiver((url) => (url.includes("play.test") ? 503 : 200));
  assert.deepEqual(await deliverDueWebhooks({ now: t0, fetchImpl }), { delivered: 1, retried: 1, failed: 0 });

  let [row] = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.targetApp, "play"));
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1);
  assert.equal(row.lastStatus, 503);
  assert.equal(row.nextAttemptAt.getTime(), t0.getTime() + 30_000);

  // Not due before the delay.
  assert.equal((await deliverDueWebhooks({ now: new Date(t0.getTime() + 29_000), fetchImpl })).retried, 0);

  let now = t0;
  let attempts = 1;
  while (row.status === "pending") {
    now = row.nextAttemptAt;
    await deliverDueWebhooks({ now, fetchImpl });
    [row] = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.targetApp, "play"));
    attempts++;
    assert.ok(attempts < 40);
  }
  assert.equal(row.status, "failed");
  assert.equal(row.attempts, retrySchedule().length);
  assert.ok(now.getTime() - t0.getTime() <= WEBHOOK_MAX_AGE_MS);
  assert.equal(calls.filter((c) => c.url.includes("saga.test")).length, 1);
});

test("jobs: dedupe while pending, retry then done", async () => {
  const { enqueueJob } = await import("../../src/lib/platform/jobs");
  await enqueueJob(platformDb, { type: "user.fetch", payload: { sub: "x" }, dedupeKey: "user.fetch:x" });
  await enqueueJob(platformDb, { type: "user.fetch", payload: { sub: "x" }, dedupeKey: "user.fetch:x" });
  assert.equal((await platformDb.select().from(platformJobs)).length, 1);
  let n = 0;
  const handlers = { "user.fetch": async () => (++n === 1 ? { status: "retry" as const, error: "down" } : { status: "done" as const }) };
  assert.deepEqual(await runDueJobs(handlers), { done: 0, retried: 1, failed: 0 });
  const [job] = await platformDb.select().from(platformJobs);
  assert.deepEqual(await runDueJobs(handlers, { now: new Date(job.nextAttemptAt.getTime() + 1) }), { done: 1, retried: 0, failed: 0 });
  // After done, the same dedupe key can be queued again.
  await enqueueJob(platformDb, { type: "user.fetch", payload: { sub: "x" }, dedupeKey: "user.fetch:x" });
  assert.equal((await platformDb.select().from(platformJobs)).length, 2);
});

const DAY = 24 * 3600_000;

/** Runs `fn` with TRETU_APPS_JSON = TEST_APPS plus webhooks for the given apps. */
async function withWebhooks<T>(extra: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const apps: Record<string, { secret: string; webhook?: string }> = structuredClone(TEST_APPS);
  for (const [app, webhook] of Object.entries(extra)) apps[app] = { ...apps[app]!, webhook };
  process.env.TRETU_APPS_JSON = JSON.stringify(apps);
  try {
    return await fn();
  } finally {
    process.env.TRETU_APPS_JSON = JSON.stringify(TEST_APPS);
  }
}

const rowOf = async (app: string) => (await platformDb.select().from(platformOutbox).where(eq(platformOutbox.targetApp, app)))[0]!;

test("apps without a webhook: rows stay pending and unattempted, then are delivered once the webhook is configured", async () => {
  const t0 = new Date("2026-05-01T08:00:00Z");
  const sub = uuid();
  const eventId = await emitPlatformEvent(platformDb, { type: "user.deleted", sub, data: {}, now: t0 });
  const { calls, fetchImpl } = receiver((url) => (url.includes("hollowmere.test") && calls.length <= 3 ? 503 : 204));

  // saga + play delivered; hollowmere and mc-dashboard are parked, not failed.
  assert.deepEqual(await deliverDueWebhooks({ now: t0, fetchImpl }), { delivered: 2, retried: 0, failed: 0 });
  for (const at of [new Date(t0.getTime() + 60_000), new Date(t0.getTime() + 3 * DAY)]) {
    assert.deepEqual(await deliverDueWebhooks({ now: at, fetchImpl }), { delivered: 0, retried: 0, failed: 0 });
  }
  let parked = await rowOf("hollowmere");
  assert.equal(parked.status, "pending");
  assert.equal(parked.attempts, 0, "no attempt, no backoff used up");
  assert.equal(parked.firstAttemptAt, null);
  assert.equal(parked.nextAttemptAt.getTime(), t0.getTime());
  assert.equal(calls.length, 2);
  const parkedSummary = (await outboxSummary(platformDb)).find((s) => s.app === "hollowmere")!;
  assert.deepEqual([parkedSummary.webhook, parkedSummary.parked, parkedSummary.queued], [false, 1, 0]);

  // Three days later the webhook is added (TRETU_APPS_JSON + worker restart): delivered, with a fresh 24 h window.
  const later = new Date(t0.getTime() + 3 * DAY);
  await withWebhooks({ hollowmere: "https://hollowmere.test/api/tretu/webhook" }, async () => {
    assert.deepEqual(await deliverDueWebhooks({ now: later, fetchImpl }), { delivered: 0, retried: 1, failed: 0 });
    parked = await rowOf("hollowmere");
    assert.equal(parked.status, "pending");
    assert.equal(parked.firstAttemptAt?.getTime(), later.getTime());
    assert.equal(parked.nextAttemptAt.getTime(), later.getTime() + 30_000, "backoff starts at the first attempt, not at creation");
    const retryAt = parked.nextAttemptAt;
    assert.deepEqual(await deliverDueWebhooks({ now: retryAt, fetchImpl }), { delivered: 1, retried: 0, failed: 0 });
    const delivered = await rowOf("hollowmere");
    assert.equal(delivered.status, "delivered");
    assert.equal(delivered.attempts, 2);

    const last = calls[calls.length - 1]!;
    assert.equal(last.url, "https://hollowmere.test/api/tretu/webhook");
    const body = JSON.parse(last.body);
    assert.equal(body.id, eventId, "original event id");
    assert.equal(body.type, "user.deleted");
    const verdict = verifySignature(
      TEST_APPS.hollowmere.secret,
      { timestamp: last.headers["x-tretu-timestamp"], method: "POST", pathWithQuery: "/api/tretu/webhook", body: last.body, signature: last.headers["x-tretu-signature"] },
      retryAt
    );
    assert.deepEqual(verdict, { ok: true });
  });
  // mc-dashboard still waits.
  assert.equal((await rowOf("mc-dashboard")).status, "pending");
});

test("retention: parked rows expire 7 days after creation; rows of apps with a webhook never expire this way", async () => {
  const t0 = new Date("2026-05-01T08:00:00Z");
  await emitPlatformEvent(platformDb, { type: "level.up", sub: uuid(), data: { level: 2 }, now: t0 });
  // The worker was down: saga/play were never attempted either.
  assert.equal(await expireParkedWebhooks(platformDb, new Date(t0.getTime() + PARKED_MAX_AGE_MS - 60_000)), 0);
  assert.equal(await expireParkedWebhooks(platformDb, new Date(t0.getTime() + PARKED_MAX_AGE_MS + 60_000)), 2);
  const rows = await platformDb.select().from(platformOutbox);
  const state = Object.fromEntries(rows.map((r) => [r.targetApp, r.status]));
  assert.deepEqual(state, { hollowmere: "expired", "mc-dashboard": "expired", play: "pending", saga: "pending" });
  assert.match((await rowOf("hollowmere")).lastError ?? "", /no webhook configured/);
  // Idempotent.
  assert.equal(await expireParkedWebhooks(platformDb, new Date(t0.getTime() + 8 * DAY)), 0);
});

test("platform:outbox retry: re-queues failed and expired rows with the original event ids, idempotent and filtered", async () => {
  const t0 = new Date("2026-05-01T08:00:00Z");
  const levelId = await emitPlatformEvent(platformDb, { type: "level.up", sub: uuid(), data: { level: 3 }, now: t0 });
  const t1 = new Date(t0.getTime() + DAY / 2);
  const badgeId = await emitPlatformEvent(platformDb, { type: "badge.earned", sub: uuid(), data: { badge: "x" }, now: t1 });
  // play gives up on both, hollowmere's rows expire.
  await platformDb
    .update(platformOutbox)
    .set({ status: "failed", attempts: 14, firstAttemptAt: t0, lastError: "HTTP 503", lastStatus: 503 })
    .where(eq(platformOutbox.targetApp, "play"));
  await platformDb.update(platformOutbox).set({ status: "expired" }).where(eq(platformOutbox.targetApp, "hollowmere"));

  const lines: string[] = [];
  const run = async (...argv: string[]) => {
    lines.length = 0;
    const code = await runOutboxCommand(argv, (l) => lines.push(l), platformDb, new Date(t0.getTime() + 2 * DAY));
    return { code, out: lines.join("\n") };
  };

  const status = await run("status");
  assert.equal(status.code, 0);
  assert.match(status.out, /^play\s+yes\s+0\s+0\s+0\s+0\s+2\s+0/m);
  assert.match(status.out, /^hollowmere\s+no\s+0\s+0\s+0\s+0\s+0\s+2/m);
  assert.match(status.out, /^mc-dashboard\s+no\s+0\s+0\s+2\s+0\s+0\s+0\s+2 d/m);
  assert.match(status.out, /parked: mc-dashboard/);

  // --type / --since filters, dry run changes nothing.
  assert.match((await run("retry", "--type", "level.up", "--dry-run")).out, /would re-queue 1 delivery .*play: 1/);
  assert.equal((await platformDb.select().from(platformOutbox).where(eq(platformOutbox.status, "failed"))).length, 2);
  const since = await run("retry", "--app", "play", "--since", t1.toISOString());
  assert.match(since.out, /^re-queued 1 delivery \(app=play, since=.*\) \(play: 1\)/);
  const requeued = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.status, "pending"));
  const playRow = requeued.find((r) => r.targetApp === "play")!;
  assert.equal(playRow.eventId, badgeId);
  assert.deepEqual([playRow.attempts, playRow.firstAttemptAt, playRow.lastError], [0, null, null]);

  // Everything else; hollowmere has no webhook, so its expired rows are skipped and reported.
  const all = await run("retry");
  assert.match(all.out, /^re-queued 1 delivery \(play: 1\)/m);
  assert.match(all.out, /skipped, app has no webhook configured: hollowmere: 2/);
  // Idempotent: nothing left to re-queue.
  assert.match((await run("retry")).out, /^re-queued 0 deliveries$/m);

  // Delivery keeps the original event ids.
  const { calls, fetchImpl } = receiver(() => 204);
  const now = new Date(t0.getTime() + 2 * DAY);
  assert.equal((await deliverDueWebhooks({ now, fetchImpl })).delivered, 4, "play's two re-queued rows and saga's two");
  const ids = calls.filter((c) => c.url.includes("play.test")).map((c) => JSON.parse(c.body).id).sort();
  assert.deepEqual(ids, [badgeId, levelId].sort());

  // Once hollowmere has a webhook, its expired rows can be re-queued too.
  await withWebhooks({ hollowmere: "https://hollowmere.test/api/tretu/webhook" }, async () => {
    assert.deepEqual(await retryOutbox(platformDb, { app: "hollowmere" }, { now }), { requeued: { hollowmere: 2 }, skippedNoWebhook: {} });
  });
});

test("platform:outbox arguments: friendly errors", async () => {
  assert.deepEqual(parseOutboxArgs(["status", "--app", "saga"]), { command: "status", filter: { app: "saga" }, dryRun: false });
  assert.equal(parseOutboxArgs(["retry", "--since", "2026-11-01"]).filter.since?.toISOString(), "2026-11-01T00:00:00.000Z");
  for (const argv of [[], ["purge"], ["status", "--app"], ["retry", "--since", "yesterday"], ["status", "--dry-run"], ["retry", "--bogus"], ["retry", "--app", "Saga!"]]) {
    assert.throws(() => parseOutboxArgs(argv), Error, JSON.stringify(argv));
  }
  const lines: string[] = [];
  assert.equal(await runOutboxCommand(["nope"], (l) => lines.push(l), platformDb), 2);
  assert.match(lines.join("\n"), /unknown command: nope[\s\S]*Usage: npm run platform:outbox/);
});
