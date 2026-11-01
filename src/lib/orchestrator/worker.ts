import { hostname } from "node:os";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, dashboardSettings, gameInstances } from "@/db/schema";
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
 * The lease lives in the settings table and is renewed while the worker is alive. Taking or renewing it is
 * a single atomic upsert: it only writes when the lease is free, expired or already ours.
 */
export async function acquireLease(leaseOwner: string = owner): Promise<boolean> {
  const now = Date.now();
  const value = JSON.stringify({ owner: leaseOwner, expiresAt: now + LEASE_TTL_MS });
  const rows = await db.execute<{ key: string }>(sql`
    insert into dashboard_settings (key, value, encrypted, updated_at)
    values (${LEASE_KEY}, ${value}, false, now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
    where (dashboard_settings.value::jsonb ->> 'owner') = ${leaseOwner}
       or coalesce((dashboard_settings.value::jsonb ->> 'expiresAt')::bigint, 0) <= ${now}
    returning key
  `);
  return rows.length > 0;
}

export async function workerHeartbeat(): Promise<{ alive: boolean; owner: string | null }> {
  const [row] = await db
    .select({ value: dashboardSettings.value })
    .from(dashboardSettings)
    .where(eq(dashboardSettings.key, LEASE_KEY))
    .limit(1);
  if (!row) return { alive: false, owner: null };
  const lease = JSON.parse(row.value) as { owner: string; expiresAt: number };
  return { alive: lease.expiresAt > Date.now(), owner: lease.owner };
}

async function failInterruptedJobs() {
  await db
    .update(actionJobs)
    .set({
      status: "failed",
      finishedAt: new Date(),
      progress: null,
      error: "Abgebrochen, weil das Dashboard neu gestartet wurde. Bitte erneut ausführen.",
    })
    .where(eq(actionJobs.status, "running"));
}

async function executeJob(job: typeof actionJobs.$inferSelect) {
  const ctx = createJobContext(job.id, job.requestedByUserId);
  try {
    const [instance] = await db.select().from(gameInstances).where(eq(gameInstances.id, job.instanceId)).limit(1);
    if (!instance) throw new Error("Instanz nicht gefunden.");
    if (instance.archivedAt) throw new Error("Instanz wurde gelöscht.");
    log("info", "job.started", { jobId: job.id, action: job.actionType, instanceId: job.instanceId });
    await runAction(instance, job.actionType, (job.payloadJson ?? {}) as Record<string, unknown>, ctx);
    ctx.log("✔ Fertig.");
    await ctx.flush();
    await db
      .update(actionJobs)
      .set({ status: "succeeded", finishedAt: new Date(), progress: null })
      .where(eq(actionJobs.id, job.id));
    log("info", "job.succeeded", { jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.log(`✖ ${message}`);
    await ctx.flush();
    await db
      .update(actionJobs)
      .set({ status: "failed", finishedAt: new Date(), progress: null, error: message.slice(0, 2000) })
      .where(eq(actionJobs.id, job.id));
    log("error", "job.failed", { jobId: job.id, action: job.actionType, error: message });
  }
}

async function claimJobs() {
  if (runningByInstance.size >= MAX_PARALLEL_JOBS) return;
  const queued = await db
    .select()
    .from(actionJobs)
    .where(eq(actionJobs.status, "queued"))
    .orderBy(asc(actionJobs.createdAt), asc(actionJobs.id));

  for (const job of queued) {
    if (runningByInstance.size >= MAX_PARALLEL_JOBS) return;
    if (runningByInstance.has(job.instanceId)) continue;
    const claimed = await db
      .update(actionJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(actionJobs.id, job.id), eq(actionJobs.status, "queued")))
      .returning({ id: actionJobs.id });
    if (claimed.length !== 1) continue;

    const promise = executeJob(job)
      .catch((error: unknown) =>
        log("error", "job.crashed", { jobId: job.id, error: error instanceof Error ? error.message : "unknown" })
      )
      .finally(() => runningByInstance.delete(job.instanceId));
    runningByInstance.set(job.instanceId, promise);
  }
}

type WorkerState = { started: boolean };
const globalState = globalThis as unknown as { __tretuWorker?: WorkerState };

export function startWorker() {
  const state = (globalState.__tretuWorker ??= { started: false });
  if (state.started) return;
  state.started = true;

  let leader = false;
  let rolesSeeded = false;
  let lastMonitor = 0;
  let monitorRunning = false;

  const loop = async () => {
    try {
      if (!rolesSeeded) {
        await seedDefaultRoles();
        rolesSeeded = true;
      }
      const hasLease = await acquireLease();
      if (hasLease && !leader) {
        leader = true;
        await failInterruptedJobs();
        log("info", "orchestrator.leader", { owner });
      } else if (!hasLease && leader) {
        leader = false;
      }

      if (leader && (await getSetupStatus()).hetzner) {
        await claimJobs();
        if (!monitorRunning && Date.now() - lastMonitor > MONITOR_INTERVAL_MS) {
          lastMonitor = Date.now();
          monitorRunning = true;
          void runMonitorTick()
            .catch((error) => log("error", "monitor.failed", { error: (error as Error).message }))
            .finally(() => (monitorRunning = false));
        }
      }
    } catch (error) {
      log("error", "orchestrator.tick_failed", { error: error instanceof Error ? error.message : "unknown" });
    }
    setTimeout(() => void loop(), JOB_POLL_MS).unref?.();
  };

  log("info", "orchestrator.started", { owner });
  void loop();
}
