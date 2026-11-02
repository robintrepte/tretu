/**
 * Webhook outbox (contract §4): every platform event is queued once per receiving app (every app in
 * TRETU_APPS_JSON except auth and tretu-web, see getWebhookReceivers) in the same transaction as the change that
 * caused it, then delivered signed (`x-tretu-app: platform`, receiving app's secret) by the worker with exponential
 * backoff for up to 24 h after the first attempt.
 *
 * An app without a `webhook` keeps its rows pending but "parked": they are not attempted and use up no backoff, and
 * are delivered once the webhook is in TRETU_APPS_JSON and the worker restarted. Parked rows older than
 * {@link PARKED_MAX_AGE_MS} (7 days) expire (`expired`). `npm run platform:outbox` shows and re-queues rows.
 */
import { randomUUID } from "node:crypto";

import { and, eq, gte, inArray, isNull, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm";

import { platformOutbox } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { platformDb, type Executor } from "@/lib/platform/db";
import { getWebhookReceivers, getWebhookSubscribers, PLATFORM_SENDER_ID } from "@/lib/platform/env";
import { signedHeaders } from "@/lib/platform/signing";

export const PLATFORM_EVENT_TYPES = [
  "user.updated",
  "user.deleted",
  "badge.earned",
  "level.up",
  "wallet.changed",
  "friend.added",
  "notification.created",
] as const;
export type PlatformEventType = (typeof PLATFORM_EVENT_TYPES)[number];

/** Retry window, counted from the first delivery attempt. */
export const WEBHOOK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long a row waits for its app's webhook to be configured (counted from creation). */
export const PARKED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const WEBHOOK_TIMEOUT_MS = 5000;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 2 * 60 * 60 * 1000;

/** Delay after the n-th failed attempt: 30 s, 1 min, 2 min, 4 min … capped at 2 h. */
export function retryDelayMs(failedAttempts: number): number {
  const n = Math.max(1, Math.floor(failedAttempts));
  return Math.min(BASE_DELAY_MS * 2 ** Math.min(n - 1, 30), MAX_DELAY_MS);
}

/** Next attempt after a failure, or null when it would fall outside `maxAgeMs` since the first attempt (give up). */
export function nextAttemptAt(
  windowStart: Date,
  failedAttempts: number,
  now: Date,
  maxAgeMs: number = WEBHOOK_MAX_AGE_MS
): Date | null {
  const next = new Date(now.getTime() + retryDelayMs(failedAttempts));
  return next.getTime() - windowStart.getTime() > maxAgeMs ? null : next;
}

/** Offsets (ms after creation) of every attempt if each one fails immediately. */
export function retrySchedule(maxAgeMs: number = WEBHOOK_MAX_AGE_MS): number[] {
  const offsets = [0];
  const created = new Date(0);
  let now = created;
  for (let attempt = 1; ; attempt++) {
    const next = nextAttemptAt(created, attempt, now, maxAgeMs);
    if (!next) return offsets;
    offsets.push(next.getTime());
    now = next;
  }
}

export type EmitInput = {
  type: PlatformEventType;
  sub: string | null;
  data: Record<string, unknown>;
  /** Apps that must not receive it (e.g. the app that caused it). */
  exceptApps?: string[];
  now?: Date;
};

/** Queues a platform event for every receiving app (with or without webhook); returns the event id. */
export async function emitPlatformEvent(db: Executor, input: EmitInput): Promise<string> {
  const id = randomUUID();
  const now = input.now ?? new Date();
  const except = new Set(input.exceptApps ?? []);
  const targets = getWebhookReceivers().filter((app) => !except.has(app));
  if (targets.length === 0) return id;
  const payload = {
    id,
    type: input.type,
    app: PLATFORM_SENDER_ID,
    sub: input.sub,
    occurredAt: now.toISOString(),
    data: input.data,
  };
  await db
    .insert(platformOutbox)
    .values(
      targets.map((app) => ({
        eventId: id,
        targetApp: app,
        type: input.type,
        sub: input.sub,
        payload,
        nextAttemptAt: now,
        createdAt: now,
      }))
    )
    .onConflictDoNothing();
  return id;
}

export type DeliveryStats = { delivered: number; retried: number; failed: number };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Claims due outbox rows of apps with a webhook (SKIP LOCKED, so several workers are safe) and delivers them. Rows
 * of apps without a webhook are left alone (parked).
 */
export async function deliverDueWebhooks(
  options: { now?: Date; limit?: number; fetchImpl?: FetchLike } = {}
): Promise<DeliveryStats> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;
  const fetchImpl = options.fetchImpl ?? fetch;
  const stats: DeliveryStats = { delivered: 0, retried: 0, failed: 0 };
  const subscribers = new Map(getWebhookSubscribers().map((s) => [s.app, s]));
  if (subscribers.size === 0) return stats;

  const rows = await platformDb.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(platformOutbox)
      .where(
        and(
          eq(platformOutbox.status, "pending"),
          inArray(platformOutbox.targetApp, [...subscribers.keys()]),
          lte(platformOutbox.nextAttemptAt, now),
          or(isNull(platformOutbox.lockedUntil), lt(platformOutbox.lockedUntil, now))
        )
      )
      .orderBy(platformOutbox.id)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length) {
      await tx
        .update(platformOutbox)
        .set({ lockedUntil: new Date(now.getTime() + 60_000) })
        .where(inArray(platformOutbox.id, due.map((r) => r.id)));
    }
    return due;
  });

  await Promise.all(
    rows.map(async (row) => {
      const target = subscribers.get(row.targetApp)!;
      // Rows queued before first_attempt_at existed keep their window from creation.
      const firstAttemptAt = row.firstAttemptAt ?? (row.attempts > 0 ? row.createdAt : now);
      const body = JSON.stringify(row.payload);
      let status: number | null = null;
      let error: string | null = null;
      try {
        const url = new URL(target.url);
        const headers = signedHeaders(
          PLATFORM_SENDER_ID,
          target.secret,
          { method: "POST", pathWithQuery: url.pathname + url.search, body },
          now
        );
        const res = await fetchImpl(target.url, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        status = res.status;
        if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
        await res.body?.cancel().catch(() => undefined);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      const attempts = row.attempts + 1;
      if (!error) {
        await platformDb
          .update(platformOutbox)
          .set({ status: "delivered", attempts, firstAttemptAt, lastStatus: status, lastError: null, deliveredAt: now, lockedUntil: null })
          .where(eq(platformOutbox.id, row.id));
        stats.delivered++;
        return;
      }
      const next = nextAttemptAt(firstAttemptAt, attempts, now);
      await platformDb
        .update(platformOutbox)
        .set({
          status: next ? "pending" : "failed",
          attempts,
          firstAttemptAt,
          lastStatus: status,
          lastError: error.slice(0, 500),
          nextAttemptAt: next ?? row.nextAttemptAt,
          lockedUntil: null,
        })
        .where(eq(platformOutbox.id, row.id));
      if (next) stats.retried++;
      else {
        stats.failed++;
        log("warn", "platform.webhook.gave_up", { app: row.targetApp, type: row.type, eventId: row.eventId, error });
      }
    })
  );
  return stats;
}

/**
 * Pending rows of apps that still have no webhook, created more than {@link PARKED_MAX_AGE_MS} ago, become
 * `expired` (run by the worker's housekeeping). Returns how many expired.
 */
export async function expireParkedWebhooks(db: Executor = platformDb, now: Date = new Date()): Promise<number> {
  const subscribed = getWebhookSubscribers().map((s) => s.app);
  const expired = await db
    .update(platformOutbox)
    .set({ status: "expired", lastError: "no webhook configured within 7 days", lockedUntil: null })
    .where(
      and(
        eq(platformOutbox.status, "pending"),
        lt(platformOutbox.createdAt, new Date(now.getTime() - PARKED_MAX_AGE_MS)),
        subscribed.length ? notInArray(platformOutbox.targetApp, subscribed) : undefined
      )
    )
    .returning({ app: platformOutbox.targetApp });
  if (expired.length) {
    const apps = [...new Set(expired.map((r) => r.app))].sort();
    log("warn", "platform.webhook.expired", { count: expired.length, apps: apps.join(",") });
  }
  return expired.length;
}

export type OutboxFilter = { app?: string; type?: string; since?: Date };

function filterWhere(filter: OutboxFilter): SQL | undefined {
  return and(
    filter.app ? eq(platformOutbox.targetApp, filter.app) : undefined,
    filter.type ? eq(platformOutbox.type, filter.type) : undefined,
    filter.since ? gte(platformOutbox.createdAt, filter.since) : undefined
  );
}

export type OutboxAppSummary = {
  app: string;
  /** Whether the app has a webhook in this process's TRETU_APPS_JSON. */
  webhook: boolean;
  /** Pending and attempted at least once (being retried). */
  retrying: number;
  /** Pending, not attempted yet (due now or soon). */
  queued: number;
  /** Pending for an app without a webhook. */
  parked: number;
  delivered: number;
  failed: number;
  expired: number;
  /** Creation time of the oldest pending row (ISO), null without any. */
  oldestPending: string | null;
};

/** Row counts per app and state (rows of every app in the table, plus every receiving app without rows). */
export async function outboxSummary(db: Executor = platformDb, filter: OutboxFilter = {}): Promise<OutboxAppSummary[]> {
  const rows = await db
    .select({
      app: platformOutbox.targetApp,
      status: platformOutbox.status,
      attempted: sql<boolean>`${platformOutbox.attempts} > 0`,
      count: sql<number>`count(*)::int`,
      oldest: sql<Date | string | null>`min(${platformOutbox.createdAt})`,
    })
    .from(platformOutbox)
    .where(filterWhere(filter))
    .groupBy(platformOutbox.targetApp, platformOutbox.status, sql`${platformOutbox.attempts} > 0`);
  const subscribed = new Set(getWebhookSubscribers().map((s) => s.app));
  const apps = new Set<string>(filter.app ? [filter.app] : getWebhookReceivers());
  for (const row of rows) apps.add(row.app);
  return [...apps].sort().map((app) => {
    const webhook = subscribed.has(app);
    const summary: OutboxAppSummary = { app, webhook, retrying: 0, queued: 0, parked: 0, delivered: 0, failed: 0, expired: 0, oldestPending: null };
    for (const row of rows.filter((r) => r.app === app)) {
      const count = Number(row.count);
      if (row.status === "pending") {
        if (!webhook) summary.parked += count;
        else if (row.attempted) summary.retrying += count;
        else summary.queued += count;
        const oldest = row.oldest ? new Date(row.oldest).toISOString() : null;
        if (oldest && (!summary.oldestPending || oldest < summary.oldestPending)) summary.oldestPending = oldest;
      } else if (row.status === "delivered" || row.status === "failed" || row.status === "expired") {
        summary[row.status] += count;
      }
    }
    return summary;
  });
}

export type RetryResult = {
  /** Rows set back to pending (per app). */
  requeued: Record<string, number>;
  /** Failed/expired rows left alone because their app has no webhook (per app). */
  skippedNoWebhook: Record<string, number>;
};

/**
 * Sets failed and expired rows back to pending with a fresh retry window (same row, so the delivery keeps the
 * original event id). Idempotent: rows already pending or delivered are never touched. Rows of apps without a
 * webhook are skipped (they would only expire again). `dryRun` only counts.
 */
export async function retryOutbox(
  db: Executor = platformDb,
  filter: OutboxFilter = {},
  options: { now?: Date; dryRun?: boolean } = {}
): Promise<RetryResult> {
  const now = options.now ?? new Date();
  const subscribed = getWebhookSubscribers().map((s) => s.app);
  const gaveUp = and(inArray(platformOutbox.status, ["failed", "expired"]), filterWhere(filter));
  const countBy = async (where: SQL | undefined) => {
    const rows = await db
      .select({ app: platformOutbox.targetApp, count: sql<number>`count(*)::int` })
      .from(platformOutbox)
      .where(where)
      .groupBy(platformOutbox.targetApp);
    return Object.fromEntries(rows.map((r) => [r.app, Number(r.count)]));
  };
  const skippedNoWebhook = await countBy(subscribed.length ? and(gaveUp, notInArray(platformOutbox.targetApp, subscribed)) : gaveUp);
  if (!subscribed.length) return { requeued: {}, skippedNoWebhook };
  const target = and(gaveUp, inArray(platformOutbox.targetApp, subscribed));
  if (options.dryRun) return { requeued: await countBy(target), skippedNoWebhook };
  const rows = await db
    .update(platformOutbox)
    .set({
      status: "pending",
      attempts: 0,
      firstAttemptAt: null,
      nextAttemptAt: now,
      lockedUntil: null,
      lastError: null,
      lastStatus: null,
    })
    .where(target)
    .returning({ app: platformOutbox.targetApp });
  const requeued: Record<string, number> = {};
  for (const row of rows) requeued[row.app] = (requeued[row.app] ?? 0) + 1;
  if (rows.length) log("info", "platform.webhook.requeued", { count: rows.length, apps: Object.keys(requeued).sort().join(",") });
  return { requeued, skippedNoWebhook };
}
