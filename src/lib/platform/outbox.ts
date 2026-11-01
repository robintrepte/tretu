/**
 * Webhook outbox (contract §4): every platform event is queued once per subscribed app (apps with a
 * `webhook` in TRETU_APPS_JSON) in the same transaction as the change that caused it, then delivered
 * signed (`x-tretu-app: platform`, receiving app's secret) by the worker with exponential backoff
 * for up to 24 h.
 */
import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";

import { platformOutbox } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { platformDb, type Executor } from "@/lib/platform/db";
import { getWebhookSubscribers, PLATFORM_SENDER_ID } from "@/lib/platform/env";
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

export const WEBHOOK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const WEBHOOK_TIMEOUT_MS = 5000;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 2 * 60 * 60 * 1000;

/** Delay after the n-th failed attempt: 30 s, 1 min, 2 min, 4 min … capped at 2 h. */
export function retryDelayMs(failedAttempts: number): number {
  const n = Math.max(1, Math.floor(failedAttempts));
  return Math.min(BASE_DELAY_MS * 2 ** Math.min(n - 1, 30), MAX_DELAY_MS);
}

/** Next attempt after a failure, or null when it would fall outside `maxAgeMs` since creation (give up). */
export function nextAttemptAt(
  createdAt: Date,
  failedAttempts: number,
  now: Date,
  maxAgeMs: number = WEBHOOK_MAX_AGE_MS
): Date | null {
  const next = new Date(now.getTime() + retryDelayMs(failedAttempts));
  return next.getTime() - createdAt.getTime() > maxAgeMs ? null : next;
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

/** Queues a platform event for every subscribed app; returns the event id. */
export async function emitPlatformEvent(db: Executor, input: EmitInput): Promise<string> {
  const id = randomUUID();
  const now = input.now ?? new Date();
  const except = new Set(input.exceptApps ?? []);
  const targets = getWebhookSubscribers().filter((s) => !except.has(s.app));
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
      targets.map((t) => ({
        eventId: id,
        targetApp: t.app,
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

/** Claims due outbox rows (SKIP LOCKED, so several workers are safe) and delivers them. */
export async function deliverDueWebhooks(
  options: { now?: Date; limit?: number; fetchImpl?: FetchLike } = {}
): Promise<DeliveryStats> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;
  const fetchImpl = options.fetchImpl ?? fetch;
  const stats: DeliveryStats = { delivered: 0, retried: 0, failed: 0 };

  const rows = await platformDb.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(platformOutbox)
      .where(
        and(
          eq(platformOutbox.status, "pending"),
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

  const subscribers = new Map(getWebhookSubscribers().map((s) => [s.app, s]));
  await Promise.all(
    rows.map(async (row) => {
      const target = subscribers.get(row.targetApp);
      if (!target) {
        await platformDb
          .update(platformOutbox)
          .set({ status: "failed", lastError: "app has no webhook configured", lockedUntil: null })
          .where(eq(platformOutbox.id, row.id));
        stats.failed++;
        return;
      }
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
          .set({ status: "delivered", attempts, lastStatus: status, lastError: null, deliveredAt: now, lockedUntil: null })
          .where(eq(platformOutbox.id, row.id));
        stats.delivered++;
        return;
      }
      const next = nextAttemptAt(row.createdAt, attempts, now);
      await platformDb
        .update(platformOutbox)
        .set({
          status: next ? "pending" : "failed",
          attempts,
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
