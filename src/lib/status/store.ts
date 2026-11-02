/**
 * Storage of the status checks: raw checks (kept {@link RAW_RETENTION_DAYS} days), hourly and daily rollups
 * (kept {@link ROLLUP_RETENTION_DAYS} days, days in Europe/Berlin) and the current state per service.
 * Rollups are updated with every check, so pruning raw checks never changes the uptime bars.
 */
import { eq, lt, sql } from "drizzle-orm";

import { platformStatusCerts, platformStatusChecks, platformStatusRollups, platformStatusServices } from "@/db/platform-schema";
import { inTransaction, type Executor } from "@/lib/platform/db";
import { nextServiceState, type ServiceRow, type StateChange } from "@/lib/status/alerts";
import type { CheckResult, ServiceState } from "@/lib/status/check";

export const RAW_RETENTION_DAYS = 7;
export const ROLLUP_RETENTION_DAYS = 90;
export const STATUS_TIME_ZONE = "Europe/Berlin";

const DAY_MS = 24 * 3600_000;

/** Stores one check and returns the state change to announce, if any (never one with `silent`, i.e. in maintenance). */
export async function recordCheck(
  db: Executor,
  service: string,
  result: CheckResult,
  at: Date,
  options: { silent?: boolean } = {}
): Promise<StateChange | null> {
  const iso = at.toISOString();
  const answered = result.responseMs !== null;
  const counts = {
    checks: 1,
    up: result.state === "up" ? 1 : 0,
    degraded: result.state === "degraded" ? 1 : 0,
    down: result.state === "down" ? 1 : 0,
    responseMsSum: answered ? result.responseMs! : 0,
    responseCount: answered ? 1 : 0,
  };
  const r = platformStatusRollups;
  return inTransaction(db, async (tx) => {
    await tx.insert(platformStatusChecks).values({
      service,
      checkedAt: at,
      state: result.state,
      responseMs: result.responseMs,
      httpStatus: result.httpStatus,
      error: result.error,
    });
    const buckets = [
      { period: "hour", bucketStart: sql`date_trunc('hour', ${iso}::timestamptz)` },
      { period: "day", bucketStart: sql`date_trunc('day', ${iso}::timestamptz, ${STATUS_TIME_ZONE})` },
    ];
    for (const bucket of buckets) {
      await tx
        .insert(r)
        .values({ service, ...bucket, ...counts })
        .onConflictDoUpdate({
          target: [r.service, r.period, r.bucketStart],
          set: {
            checks: sql`${r.checks} + excluded.checks`,
            up: sql`${r.up} + excluded.up`,
            degraded: sql`${r.degraded} + excluded.degraded`,
            down: sql`${r.down} + excluded.down`,
            responseMsSum: sql`${r.responseMsSum} + excluded.response_ms_sum`,
            responseCount: sql`${r.responseCount} + excluded.response_count`,
          },
        });
    }

    const [prev] = await tx.select().from(platformStatusServices).where(eq(platformStatusServices.service, service)).for("update");
    const previous: ServiceRow | null = prev
      ? {
          state: prev.state as ServiceState,
          since: prev.since,
          consecutive: prev.consecutive,
          alertedState: prev.alertedState as ServiceState,
          alertedAt: prev.alertedAt,
        }
      : null;
    // Checks are recorded in order; an older one arriving late (clock change) must not rewind the state.
    if (prev && prev.lastCheckedAt > at) return null;
    const { row, change } = nextServiceState(previous, result, at, options);
    const values = {
      ...row,
      lastCheckedAt: at,
      lastResponseMs: result.responseMs,
      lastError: result.error,
      usersOnline: result.usersOnline ?? null,
      usersMax: result.usersMax ?? null,
    };
    await tx
      .insert(platformStatusServices)
      .values({ service, ...values })
      .onConflictDoUpdate({ target: platformStatusServices.service, set: values });
    return change;
  });
}

/** Deletes raw checks older than 7 days and rollups older than 90 days. Returns the number of deleted rows. */
export async function pruneStatus(db: Executor, now: Date = new Date()): Promise<{ checks: number; rollups: number }> {
  const checks = await db
    .delete(platformStatusChecks)
    .where(lt(platformStatusChecks.checkedAt, new Date(now.getTime() - RAW_RETENTION_DAYS * DAY_MS)))
    .returning({ id: platformStatusChecks.id });
  // One extra day so the oldest of the 90 daily bars (a calendar day in Europe/Berlin) stays complete.
  const rollups = await db
    .delete(platformStatusRollups)
    .where(lt(platformStatusRollups.bucketStart, new Date(now.getTime() - (ROLLUP_RETENTION_DAYS + 1) * DAY_MS)))
    .returning({ service: platformStatusRollups.service });
  // Certificates of hosts that are no longer checked.
  await db.delete(platformStatusCerts).where(lt(platformStatusCerts.checkedAt, new Date(now.getTime() - 30 * DAY_MS)));
  return { checks: checks.length, rollups: rollups.length };
}

