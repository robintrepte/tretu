/**
 * Background work of the platform (run by scripts/platform-worker.ts, PM2 `tretu-platform-worker`):
 * webhook delivery, jobs (web push, Discord/TeamSpeak badge sync, user fetches), presence expiry,
 * badge sync reconciliation and housekeeping.
 */
import { and, inArray, lt } from "drizzle-orm";

import { platformJobs, platformOutbox } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { createTeamspeakSyncHandler, discordRevokeJob, discordSyncJob, reconcileBadgeSync } from "@/lib/platform/badge-sync";
import { platformDb } from "@/lib/platform/db";
import { AuthUnavailableError, refreshStub } from "@/lib/platform/directory";
import { runDueJobs, type JobOutcome, type JobRow } from "@/lib/platform/jobs";
import { pruneNotifications } from "@/lib/platform/notifications";
import { tsAuthLinkJob, tsAuthUnlinkJob } from "@/lib/platform/ts-auth-link";
import { deliverDueWebhooks } from "@/lib/platform/outbox";
import { expirePresence } from "@/lib/platform/presence";
import { sendPushJob } from "@/lib/platform/push";

async function userFetchJob(job: JobRow): Promise<JobOutcome> {
  try {
    await refreshStub(platformDb, String(job.payload.sub ?? ""));
    return { status: "done" };
  } catch (error) {
    if (error instanceof AuthUnavailableError && error.message.includes("not configured")) return { status: "done" };
    return { status: "retry", error: error instanceof Error ? error.message : String(error) };
  }
}

/** One delivery/job pass. Returns how much work was done (0 = idle). */
export async function runDeliveryTick(now: Date = new Date(), shouldStop: () => boolean = () => false): Promise<number> {
  let work = 0;
  for (let i = 0; i < 10 && !shouldStop(); i++) {
    const stats = await deliverDueWebhooks({ now, limit: 50 });
    const n = stats.delivered + stats.retried + stats.failed;
    work += n;
    if (n < 50) break;
  }
  const jobs = await runDueJobs(
    {
      "push.send": (job) => sendPushJob(platformDb, job),
      "badge.sync.discord": (job) => discordSyncJob(platformDb, job),
      "badge.revoke.discord": (job) => discordRevokeJob(platformDb, job),
      "user.fetch": userFetchJob,
      "auth.link.teamspeak": (job) => tsAuthLinkJob(platformDb, job),
      "auth.unlink.teamspeak": (job) => tsAuthUnlinkJob(platformDb, job),
    },
    { now, limit: 50, shouldStop }
  );
  work += jobs.done + jobs.retried + jobs.failed;
  if (shouldStop()) return work;

  const ts = createTeamspeakSyncHandler(platformDb);
  try {
    const tsJobs = await runDueJobs({ "badge.sync.teamspeak": ts.handle, "badge.revoke.teamspeak": ts.revoke }, { now, limit: 50, shouldStop });
    work += tsJobs.done + tsJobs.retried + tsJobs.failed;
  } finally {
    await ts.close();
  }
  return work;
}

export async function runPresenceTick(now: Date = new Date()): Promise<number> {
  return expirePresence(platformDb, now);
}

export async function runMaintenanceTick(now: Date = new Date()): Promise<void> {
  const queued = await reconcileBadgeSync(platformDb, now);
  if (queued) log("info", "platform.worker.badge_sync_queued", { queued });
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600_000);
  await platformDb
    .delete(platformOutbox)
    .where(and(inArray(platformOutbox.status, ["delivered"]), lt(platformOutbox.createdAt, weekAgo)));
  await platformDb.delete(platformOutbox).where(and(inArray(platformOutbox.status, ["failed"]), lt(platformOutbox.createdAt, monthAgo)));
  await platformDb.delete(platformJobs).where(and(inArray(platformJobs.status, ["done"]), lt(platformJobs.createdAt, weekAgo)));
  await platformDb.delete(platformJobs).where(and(inArray(platformJobs.status, ["failed"]), lt(platformJobs.createdAt, monthAgo)));
  await pruneNotifications(platformDb, 180);
}
