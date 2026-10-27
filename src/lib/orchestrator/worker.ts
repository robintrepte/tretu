import { hostname } from "node:os";

import { and, asc, eq } from "drizzle-orm";

import { db, sqlite } from "@/db";
import { actionJobs, gameInstances } from "@/db/schema";
import { runAction } from "@/lib/orchestrator/actions";
import { createJobContext } from "@/lib/orchestrator/jobs";
import { runMonitorTick } from "@/lib/orchestrator/monitor";
import { log } from "@/lib/observability/logger";
import { seedDefaultRoles } from "@/lib/permissions/checks";
import { getSetupStatus } from "@/lib/settings/store";

const MAX_PARALLEL_JOBS = 4;
const JOB_POLL_MS = 2000;
const MONITOR_INTERVAL_MS = 30_000;
const LEASE_TTL_MS = 30_000;
const LEASE_KEY = "worker.lease";

const owner = `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
const runningByInstance = new Map<number, Promise<void>>();

/**
 * Only one process (Next.js server or `npm run worker:orchestrator`) may run jobs.
 * The lease lives in the settings table and is renewed while the worker is alive.
 */
function acquireLease(): boolean {
  const now = Date.now();
  const tx = sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT value FROM dashboard_settings WHERE key = ?").get(LEASE_KEY) as
      | { value: string }
      | undefined;
    if (row) {
      const lease = JSON.parse(row.value) as { owner: string; expiresAt: number };
      if (lease.owner !== owner && lease.expiresAt > now) return false;
    }
    sqlite
      .prepare(
        "INSERT INTO dashboard_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .run(LEASE_KEY, JSON.stringify({ owner, expiresAt: now + LEASE_TTL_MS }), Math.floor(now / 1000));
    return true;
  });
  return tx.immediate();
}

export function workerHeartbeat(): { alive: boolean; owner: string | null } {
  const row = sqlite.prepare("SELECT value FROM dashboard_settings WHERE key = ?").get(LEASE_KEY) as
    | { value: string }
    | undefined;
  if (!row) return { alive: false, owner: null };
  const lease = JSON.parse(row.value) as { owner: string; expiresAt: number };
  return { alive: lease.expiresAt > Date.now(), owner: lease.owner };
}

function failInterruptedJobs() {
  const interrupted = db.select().from(actionJobs).where(eq(actionJobs.status, "running")).all();
  for (const job of interrupted) {
    db.update(actionJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        progress: null,
        error: "Abgebrochen, weil das Dashboard neu gestartet wurde. Bitte erneut ausführen.",
      })
      .where(eq(actionJobs.id, job.id))
      .run();
  }
}

async function executeJob(job: typeof actionJobs.$inferSelect) {
  const ctx = createJobContext(job.id, job.requestedByUserId);
  try {
    const instance = db.select().from(gameInstances).where(eq(gameInstances.id, job.instanceId)).get();
    if (!instance) throw new Error("Instanz nicht gefunden.");
    if (instance.archivedAt) throw new Error("Instanz wurde gelöscht.");
    log("info", "job.started", { jobId: job.id, action: job.actionType, instanceId: job.instanceId });
    await runAction(instance, job.actionType, (job.payloadJson ?? {}) as Record<string, unknown>, ctx);
    ctx.flush();
    ctx.log("✔ Fertig.");
    db.update(actionJobs)
      .set({ status: "succeeded", finishedAt: new Date(), progress: null })
      .where(eq(actionJobs.id, job.id))
      .run();
    log("info", "job.succeeded", { jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flush();
    ctx.log(`✖ ${message}`);
    db.update(actionJobs)
      .set({ status: "failed", finishedAt: new Date(), progress: null, error: message.slice(0, 2000) })
      .where(eq(actionJobs.id, job.id))
      .run();
    log("error", "job.failed", { jobId: job.id, action: job.actionType, error: message });
  }
}

function claimJobs() {
  if (runningByInstance.size >= MAX_PARALLEL_JOBS) return;
  const queued = db.select().from(actionJobs).where(eq(actionJobs.status, "queued")).orderBy(asc(actionJobs.createdAt)).all();

  for (const job of queued) {
    if (runningByInstance.size >= MAX_PARALLEL_JOBS) return;
    if (runningByInstance.has(job.instanceId)) continue;
    const claimed = db
      .update(actionJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(actionJobs.id, job.id), eq(actionJobs.status, "queued")))
      .run();
    if (claimed.changes !== 1) continue;

    const promise = executeJob(job).finally(() => runningByInstance.delete(job.instanceId));
    runningByInstance.set(job.instanceId, promise);
  }
}

type WorkerState = { started: boolean };
const globalState = globalThis as unknown as { __tretuWorker?: WorkerState };

export function startWorker() {
  const state = (globalState.__tretuWorker ??= { started: false });
  if (state.started) return;
  state.started = true;

  seedDefaultRoles();
  let leader = false;
  let lastMonitor = 0;
  let monitorRunning = false;

  const loop = async () => {
    try {
      const hasLease = acquireLease();
      if (hasLease && !leader) {
        leader = true;
        failInterruptedJobs();
        log("info", "orchestrator.leader", { owner });
      } else if (!hasLease && leader) {
        leader = false;
      }

      if (leader && getSetupStatus().hetzner) {
        claimJobs();
        if (!monitorRunning && Date.now() - lastMonitor > MONITOR_INTERVAL_MS) {
          lastMonitor = Date.now();
          monitorRunning = true;
          runMonitorTick()
            .catch((error) => log("error", "monitor.failed", { error: (error as Error).message }))
            .finally(() => (monitorRunning = false));
        }
      }
    } catch (error) {
      log("error", "orchestrator.tick_failed", { error: error instanceof Error ? error.message : "unknown" });
    }
    setTimeout(loop, JOB_POLL_MS).unref?.();
  };

  log("info", "orchestrator.started", { owner });
  void loop();
}
