/**
 * Small persistent job queue for side effects that talk to the outside world (web push,
 * Discord/TeamSpeak badge sync, user fetches from auth). Processed by scripts/platform-worker.ts.
 */
import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";

import { platformJobs } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { platformDb, type Executor } from "@/lib/platform/db";
import { nextAttemptAt, WEBHOOK_MAX_AGE_MS } from "@/lib/platform/outbox";

export type JobType =
  | "push.send"
  | "badge.sync.discord"
  | "badge.sync.teamspeak"
  | "badge.revoke.discord"
  | "badge.revoke.teamspeak"
  | "user.fetch";
export type JobRow = typeof platformJobs.$inferSelect;

/** done | retry later | give up. */
export type JobOutcome = { status: "done" } | { status: "retry"; error: string } | { status: "failed"; error: string };

export type JobHandler = (job: JobRow) => Promise<JobOutcome>;

/**
 * Max age before a job is given up (default 24 h). Push is useless after an hour; role removals after
 * a deletion keep trying for a week (e.g. Discord or TeamSpeak down for a while).
 */
const MAX_AGE_MS: Partial<Record<JobType, number>> = {
  "push.send": 60 * 60 * 1000,
  "badge.revoke.discord": 7 * 24 * 3600_000,
  "badge.revoke.teamspeak": 7 * 24 * 3600_000,
};

/**
 * Payload keys removed once a job is finished (done or failed): revoke jobs carry the Discord /
 * TeamSpeak identity of a deleted user and must not keep it after the work is done.
 */
const SCRUB_ON_FINISH: Partial<Record<JobType, string[]>> = {
  "badge.revoke.discord": ["to"],
  "badge.revoke.teamspeak": ["to"],
};

function scrubbed(job: JobRow): Record<string, unknown> | undefined {
  const keys = SCRUB_ON_FINISH[job.type as JobType];
  if (!keys) return undefined;
  return Object.fromEntries(Object.entries(job.payload).filter(([k]) => !keys.includes(k)));
}

export async function enqueueJob(
  db: Executor,
  job: { type: JobType; payload: Record<string, unknown>; dedupeKey?: string; sub?: string | null; runAt?: Date }
): Promise<void> {
  await db
    .insert(platformJobs)
    .values({
      type: job.type,
      payload: job.payload,
      dedupeKey: job.dedupeKey ?? null,
      sub: job.sub ?? null,
      nextAttemptAt: job.runAt ?? new Date(),
    })
    .onConflictDoNothing();
}

export async function runDueJobs(
  handlers: Partial<Record<JobType, JobHandler>>,
  options: { now?: Date; limit?: number; types?: JobType[] } = {}
): Promise<{ done: number; retried: number; failed: number }> {
  const now = options.now ?? new Date();
  const types = options.types ?? (Object.keys(handlers) as JobType[]);
  const result = { done: 0, retried: 0, failed: 0 };
  if (!types.length) return result;

  const rows = await platformDb.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(platformJobs)
      .where(
        and(
          eq(platformJobs.status, "pending"),
          inArray(platformJobs.type, types),
          lte(platformJobs.nextAttemptAt, now),
          or(isNull(platformJobs.lockedUntil), lt(platformJobs.lockedUntil, now))
        )
      )
      .orderBy(platformJobs.id)
      .limit(options.limit ?? 25)
      .for("update", { skipLocked: true });
    if (due.length) {
      await tx
        .update(platformJobs)
        .set({ lockedUntil: new Date(now.getTime() + 120_000) })
        .where(inArray(platformJobs.id, due.map((j) => j.id)));
    }
    return due;
  });

  // Sequential on purpose: Discord/TeamSpeak rate limits.
  for (const job of rows) {
    const handler = handlers[job.type as JobType];
    let outcome: JobOutcome;
    try {
      outcome = handler ? await handler(job) : { status: "failed", error: `no handler for ${job.type}` };
    } catch (error) {
      outcome = { status: "retry", error: error instanceof Error ? error.message : String(error) };
    }
    const attempts = job.attempts + 1;
    if (outcome.status === "done") {
      await platformDb
        .update(platformJobs)
        .set({ status: "done", attempts, finishedAt: now, lockedUntil: null, lastError: null, ...(scrubbed(job) && { payload: scrubbed(job) }) })
        .where(eq(platformJobs.id, job.id));
      result.done++;
      continue;
    }
    const next =
      outcome.status === "retry"
        ? nextAttemptAt(job.createdAt, attempts, now, MAX_AGE_MS[job.type as JobType] ?? WEBHOOK_MAX_AGE_MS)
        : null;
    await platformDb
      .update(platformJobs)
      .set({
        status: next ? "pending" : "failed",
        attempts,
        nextAttemptAt: next ?? job.nextAttemptAt,
        lockedUntil: null,
        lastError: outcome.error.slice(0, 500),
        finishedAt: next ? null : now,
        ...(!next && scrubbed(job) && { payload: scrubbed(job) }),
      })
      .where(eq(platformJobs.id, job.id));
    if (next) result.retried++;
    else {
      result.failed++;
      log("warn", "platform.job.failed", { type: job.type, id: job.id, error: outcome.error });
    }
  }
  return result;
}
