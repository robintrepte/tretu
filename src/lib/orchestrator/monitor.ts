import { and, eq, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, gameInstances, infraServers, instanceStatusSnapshots } from "@/db/schema";
import { getGameDefinition } from "@/lib/games/catalog";
import { readProfile } from "@/lib/games/profile";
import { networkPlayerQuery, parseProbe, probeScript, type ProbeResult } from "@/lib/games/runtime";
import { hetznerClient } from "@/lib/hetzner/client";
import { getActiveServer, type InstanceRow, type ServerRow } from "@/lib/orchestrator/host";
import { enqueueJob, systemUserId } from "@/lib/orchestrator/jobs";
import { executeRemoteCommand } from "@/lib/orchestrator/ssh";
import { log } from "@/lib/observability/logger";
import type { GameStatus } from "@/lib/dashboard/status";

const SNAPSHOT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const STARTING_GRACE_MS = 60 * 60 * 1000;
const DRIFT_CHECK_INTERVAL_MS = 10 * 60 * 1000;

let lastDriftCheck = 0;

function deriveGameStatus(instance: InstanceRow, probe: ProbeResult): GameStatus {
  if (probe.container === "restarting") return "crashed";
  if (probe.container !== "running") return "stopped";
  if (probe.health === "unhealthy") return "crashed";
  if (probe.players !== null) return "running";
  if (probe.health === "starting") return "starting";

  const def = getGameDefinition(instance.gameType);
  if (!def?.features.playerCount) return "running";
  // Games with a player query answer once they are ready; until then they are still loading.
  const started = probe.startedAt ? Date.parse(probe.startedAt) : NaN;
  if (Number.isFinite(started) && Date.now() - started < STARTING_GRACE_MS) return "starting";
  return "crashed";
}

async function hasRunningJob(instanceId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: actionJobs.id })
    .from(actionJobs)
    .where(and(eq(actionJobs.instanceId, instanceId), eq(actionJobs.status, "running")))
    .limit(1);
  return Boolean(row);
}

async function checkInstance(instance: InstanceRow, server: ServerRow) {
  if (!server.ipV4 || server.status !== "running" || (await hasRunningJob(instance.id))) return;
  const profile = readProfile(instance.gameType, instance.configProfile);

  let probe: ProbeResult | null = null;
  try {
    const res = await executeRemoteCommand(server.ipV4, probeScript(instance.gameType, profile), { timeoutMs: 25_000 });
    probe = parseProbe(instance.gameType, profile, res.stdout);
    if (probe.players === null && probe.container === "running") {
      const net = await networkPlayerQuery(instance.gameType, server.ipV4);
      if (net) Object.assign(probe, net);
    }
  } catch (error) {
    log("warn", "monitor.probe_failed", { instanceId: instance.id, error: (error as Error).message });
  }

  const gameStatus: GameStatus = probe ? deriveGameStatus(instance, probe) : "unreachable";
  await db.insert(instanceStatusSnapshots).values({
    instanceId: instance.id,
    infraStatus: probe ? "running" : "unreachable",
    gameStatus,
    playerCount: probe?.players ?? null,
    maxPlayers: probe?.maxPlayers ?? null,
    lastHeartbeatAt: new Date(),
    rawJson: probe ?? {},
  });

  const now = Date.now();
  if (probe?.players) {
    await db.update(gameInstances).set({ lastActivityAt: new Date() }).where(eq(gameInstances.id, instance.id));
    return;
  }

  // Idle shutdown: no players (or game not running) for longer than the configured time.
  const idleMinutes = instance.idleDeleteAfterMinutes;
  if (idleMinutes <= 0 || !probe) return;
  const idle =
    probe.players === 0 ||
    gameStatus === "stopped" ||
    gameStatus === "crashed" ||
    (gameStatus === "starting" && probe.startedAt && now - Date.parse(probe.startedAt) > STARTING_GRACE_MS);
  if (!idle) return;

  const since = Math.max(instance.lastActivityAt?.getTime() ?? 0, server.createdAt.getTime());
  if (now - since < idleMinutes * 60_000) return;

  const { deduplicated } = await enqueueJob({
    instanceId: instance.id,
    actionType: "hibernate",
    userId: await systemUserId(),
    payload: { reason: "idle" },
    idempotencyKey: `idle-hibernate-${server.id}`,
  });
  if (!deduplicated) log("info", "monitor.idle_hibernate", { instanceId: instance.id, idleMinutes });
}

/** Marks VMs that were deleted outside the dashboard (e.g. in the Hetzner console). */
async function checkDrift(servers: Array<{ instance: InstanceRow; server: ServerRow }>) {
  if (Date.now() - lastDriftCheck < DRIFT_CHECK_INTERVAL_MS) return;
  lastDriftCheck = Date.now();
  for (const { instance, server } of servers) {
    if (await hasRunningJob(instance.id)) continue;
    try {
      const remote = await hetznerClient.getServer(server.hetznerServerId);
      if (!remote) {
        await db
          .update(infraServers)
          .set({ deletedAt: new Date(), status: "deleted" })
          .where(eq(infraServers.id, server.id));
        log("warn", "monitor.server_vanished", { instanceId: instance.id, serverId: server.hetznerServerId });
      }
    } catch (error) {
      log("warn", "monitor.drift_check_failed", { error: (error as Error).message });
      return;
    }
  }
}

export async function runMonitorTick() {
  const instances = await db.select().from(gameInstances).where(isNull(gameInstances.archivedAt));
  const withServers = (
    await Promise.all(instances.map(async (instance) => ({ instance, server: await getActiveServer(instance.id) })))
  ).filter((x): x is { instance: InstanceRow; server: ServerRow } => Boolean(x.server));

  await Promise.allSettled(withServers.map(({ instance, server }) => checkInstance(instance, server)));
  await checkDrift(withServers);

  await db
    .delete(instanceStatusSnapshots)
    .where(lt(instanceStatusSnapshots.createdAt, new Date(Date.now() - SNAPSHOT_RETENTION_MS)));
}
