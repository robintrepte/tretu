import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, users } from "@/db/schema";
import type { ActionType } from "@/lib/orchestrator/action-types";

const MAX_LOG_CHARS = 60_000;
/** Actions that may be queued several times (different payloads). */
const STACKABLE: ActionType[] = ["backup", "restore", "deleteBackup"];

const SYSTEM_DISCORD_ID = "system:tretu-dashboard";

/** User row that automatic jobs (idle shutdown, auto-backup) are attributed to. */
export function systemUserId(): number {
  const existing = db.select({ id: users.id }).from(users).where(eq(users.discordId, SYSTEM_DISCORD_ID)).get();
  if (existing) return existing.id;
  const res = db
    .insert(users)
    .values({ discordId: SYSTEM_DISCORD_ID, displayName: "Automatik" })
    .onConflictDoNothing()
    .run();
  if (res.changes) return Number(res.lastInsertRowid);
  return db.select({ id: users.id }).from(users).where(eq(users.discordId, SYSTEM_DISCORD_ID)).get()!.id;
}

export function enqueueJob(input: {
  instanceId: number;
  actionType: ActionType;
  userId: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}): { jobId: number; deduplicated: boolean } {
  if (input.idempotencyKey) {
    const clash = db.select().from(actionJobs).where(eq(actionJobs.idempotencyKey, input.idempotencyKey)).get();
    if (clash) return { jobId: clash.id, deduplicated: true };
  }

  if (!STACKABLE.includes(input.actionType)) {
    const pending = db
      .select()
      .from(actionJobs)
      .where(
        and(
          eq(actionJobs.instanceId, input.instanceId),
          eq(actionJobs.actionType, input.actionType),
          eq(actionJobs.status, "queued")
        )
      )
      .get();
    if (pending) return { jobId: pending.id, deduplicated: true };
  }

  const res = db
    .insert(actionJobs)
    .values({
      instanceId: input.instanceId,
      actionType: input.actionType,
      requestedByUserId: input.userId,
      payloadJson: input.payload ?? {},
      idempotencyKey:
        input.idempotencyKey ?? `${input.instanceId}-${input.actionType}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      status: "queued",
    })
    .run();
  return { jobId: Number(res.lastInsertRowid), deduplicated: false };
}

/** Cancels queued jobs of an instance (e.g. before deleting it). */
export function cancelQueuedJobs(instanceId: number, exceptJobId?: number) {
  const queued = db
    .select({ id: actionJobs.id })
    .from(actionJobs)
    .where(and(eq(actionJobs.instanceId, instanceId), eq(actionJobs.status, "queued")))
    .all()
    .map((j) => j.id)
    .filter((id) => id !== exceptJobId);
  if (!queued.length) return;
  db.update(actionJobs)
    .set({ status: "cancelled", finishedAt: new Date(), progress: null })
    .where(inArray(actionJobs.id, queued))
    .run();
}

export type JobContext = {
  jobId: number;
  userId: number;
  log: (message: string) => void;
  step: (label: string) => void;
  /** Raw command output; buffered and written about once per second. */
  output: (chunk: string) => void;
  flush: () => void;
};

export function createJobContext(jobId: number, userId: number): JobContext {
  const append = (text: string) => {
    db.update(actionJobs)
      .set({ log: sql`substr(${actionJobs.log} || ${text}, -${MAX_LOG_CHARS})` })
      .where(eq(actionJobs.id, jobId))
      .run();
  };
  const stamp = () => new Date().toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin" });

  let pending = "";
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
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
      flush();
      append(message.endsWith("\n") ? message : `${message}\n`);
    },
    step: (label) => {
      flush();
      db.update(actionJobs).set({ progress: label }).where(eq(actionJobs.id, jobId)).run();
      append(`\n[${stamp()}] ▶ ${label}\n`);
    },
    output: (chunk) => {
      pending += chunk;
      if (pending.length > 16_000) flush();
      else timer ??= setTimeout(flush, 1000);
    },
    flush,
  };
}
