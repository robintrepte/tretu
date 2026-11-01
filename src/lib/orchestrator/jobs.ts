import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, users } from "@/db/schema";
import type { ActionType } from "@/lib/orchestrator/action-types";
import { log as logEvent } from "@/lib/observability/logger";

const MAX_LOG_CHARS = 60_000;
/** Actions that may be queued several times (different payloads). */
const STACKABLE: ActionType[] = ["backup", "restore", "deleteBackup"];

export const SYSTEM_DISCORD_ID = "system:tretu-dashboard";

/** User row that automatic jobs (idle shutdown, auto-backup) are attributed to. */
export async function systemUserId(): Promise<number> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.discordId, SYSTEM_DISCORD_ID)).limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(users)
    .values({ discordId: SYSTEM_DISCORD_ID, displayName: "Automatik" })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) return created.id;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.discordId, SYSTEM_DISCORD_ID)).limit(1);
  return row!.id;
}

export async function enqueueJob(input: {
  instanceId: number;
  actionType: ActionType;
  userId: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<{ jobId: number; deduplicated: boolean }> {
  if (input.idempotencyKey) {
    const [clash] = await db
      .select({ id: actionJobs.id })
      .from(actionJobs)
      .where(eq(actionJobs.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (clash) return { jobId: clash.id, deduplicated: true };
  }

  if (!STACKABLE.includes(input.actionType)) {
    const [pending] = await db
      .select({ id: actionJobs.id })
      .from(actionJobs)
      .where(
        and(
          eq(actionJobs.instanceId, input.instanceId),
          eq(actionJobs.actionType, input.actionType),
          eq(actionJobs.status, "queued")
        )
      )
      .limit(1);
    if (pending) return { jobId: pending.id, deduplicated: true };
  }

  const idempotencyKey =
    input.idempotencyKey ?? `${input.instanceId}-${input.actionType}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const [created] = await db
    .insert(actionJobs)
    .values({
      instanceId: input.instanceId,
      actionType: input.actionType,
      requestedByUserId: input.userId,
      payloadJson: input.payload ?? {},
      idempotencyKey,
      status: "queued",
    })
    // Two concurrent requests with the same idempotency key: the second one returns the first job.
    .onConflictDoNothing({ target: actionJobs.idempotencyKey })
    .returning({ id: actionJobs.id });
  if (created) return { jobId: created.id, deduplicated: false };
  const [existing] = await db
    .select({ id: actionJobs.id })
    .from(actionJobs)
    .where(eq(actionJobs.idempotencyKey, idempotencyKey))
    .limit(1);
  return { jobId: existing!.id, deduplicated: true };
}

/** Cancels queued jobs of an instance (e.g. before deleting it). */
export async function cancelQueuedJobs(instanceId: number, exceptJobId?: number): Promise<void> {
  const queued = (
    await db
      .select({ id: actionJobs.id })
      .from(actionJobs)
      .where(and(eq(actionJobs.instanceId, instanceId), eq(actionJobs.status, "queued")))
  )
    .map((j) => j.id)
    .filter((id) => id !== exceptJobId);
  if (!queued.length) return;
  await db
    .update(actionJobs)
    .set({ status: "cancelled", finishedAt: new Date(), progress: null })
    .where(and(inArray(actionJobs.id, queued), eq(actionJobs.status, "queued")));
}

export type JobContext = {
  jobId: number;
  userId: number;
  log: (message: string) => void;
  step: (label: string) => void;
  /** Raw command output; buffered and written about once per second. */
  output: (chunk: string) => void;
  /** Writes buffered output and resolves once every queued log write has reached the database. */
  flush: () => Promise<void>;
};

export function createJobContext(jobId: number, userId: number): JobContext {
  // Log writes are queued so they reach the database in order, without blocking the job itself.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (write: () => Promise<unknown>) => {
    queue = queue.then(write).then(
      () => undefined,
      (error: unknown) =>
        logEvent("warn", "job.log_write_failed", { jobId, error: error instanceof Error ? error.message : "unknown" })
    );
  };
  const append = (text: string) =>
    enqueue(() =>
      db
        .update(actionJobs)
        .set({ log: sql`right(${actionJobs.log} || ${text}, ${MAX_LOG_CHARS})` })
        .where(eq(actionJobs.id, jobId))
    );
  const stamp = () => new Date().toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin" });

  let pending = "";
  let timer: NodeJS.Timeout | null = null;
  const flushPending = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    // Strip ANSI colour codes and carriage-return progress bars.
    const text = pending.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
    pending = "";
    append(text);
  };

  return {
    jobId,
    userId,
    log: (message) => {
      flushPending();
      append(message.endsWith("\n") ? message : `${message}\n`);
    },
    step: (label) => {
      flushPending();
      enqueue(() => db.update(actionJobs).set({ progress: label }).where(eq(actionJobs.id, jobId)));
      append(`\n[${stamp()}] ▶ ${label}\n`);
    },
    output: (chunk) => {
      pending += chunk;
      if (pending.length > 16_000) flushPending();
      else timer ??= setTimeout(flushPending, 1000);
    },
    flush: () => {
      flushPending();
      return queue;
    },
  };
}
