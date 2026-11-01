import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { closeDatabase, resetDatabase, TEST_APPS, uuid } from "./helpers";
import { platformJobs, platformOutbox } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { runDueJobs } from "../../src/lib/platform/jobs";
import { deliverDueWebhooks, emitPlatformEvent, nextAttemptAt, retryDelayMs, retrySchedule, WEBHOOK_MAX_AGE_MS } from "../../src/lib/platform/outbox";
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
  assert.deepEqual(rows.map((r) => r.targetApp).sort(), ["play", "saga"]);
  assert.equal(rows[0].eventId, rows[1].eventId);

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
