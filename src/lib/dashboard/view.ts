import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, gameBackups, gameInstances, instanceStatusSnapshots, users } from "@/db/schema";
import { getGameDefinition, type SettingValues } from "@/lib/games/catalog";
import { getGameArt } from "@/lib/games/art";
import type { MinecraftSource } from "@/lib/games/minecraft-source";
import { readProfile } from "@/lib/games/profile";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import { ACTION_LABELS } from "@/lib/orchestrator/action-types";
import { getActiveServer, getVolume, instanceHostname, type InstanceRow } from "@/lib/orchestrator/host";
import type { GameStatus, OverallState } from "@/lib/dashboard/status";
import { getCloudflareConfig } from "@/lib/settings/store";

export type JobView = {
  id: number;
  actionType: string;
  label: string;
  status: string;
  progress: string | null;
  error: string | null;
  requestedBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type InstanceSummary = {
  id: number;
  name: string;
  slug: string;
  gameType: string;
  gameLabel: string;
  supported: boolean;
  state: OverallState;
  activeJob: JobView | null;
  players: number | null;
  maxPlayers: number | null;
  address: string | null;
  ip: string | null;
  serverType: string;
  region: string;
  pricePerHour: number | null;
  idleMinutes: number;
  /** Estimated time of the automatic shutdown (ISO), when idle shutdown applies. */
  idleShutdownAt: string | null;
  hostSince: string | null;
};

export type BackupView = { id: number; fileName: string; sizeBytes: number | null; kind: string; createdAt: string };

export type InstanceDetail = InstanceSummary & {
  subdomain: string | null;
  domain: string | null;
  settings: SettingValues;
  minecraft: MinecraftSource | null;
  backupRetention: number;
  backupOnHibernate: boolean;
  volume: { sizeGb: number; usedBytes: number | null; totalBytes: number | null } | null;
  recentJobs: JobView[];
  lastFailedJob: JobView | null;
  backups: BackupView[];
  lastHeartbeat: string | null;
  createdAt: string;
};

function toJobView(job: typeof actionJobs.$inferSelect, userNames: Map<number, string>): JobView {
  return {
    id: job.id,
    actionType: job.actionType,
    label: ACTION_LABELS[job.actionType] ?? job.actionType,
    status: job.status,
    progress: job.progress ?? null,
    error: job.error ?? null,
    requestedBy: userNames.get(job.requestedByUserId) ?? null,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

function userNameMap(ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  return new Map(
    db
      .select({ id: users.id, name: users.displayName })
      .from(users)
      .where(inArray(users.id, [...new Set(ids)]))
      .all()
      .map((u) => [u.id, u.name])
  );
}

async function priceLookup() {
  try {
    const options = await getHetznerOptions();
    return (serverType: string, location: string) =>
      options.serverTypes.find((t) => t.name === serverType)?.prices[location]?.hourly ?? null;
  } catch {
    return () => null;
  }
}

function buildSummary(
  instance: InstanceRow,
  price: (serverType: string, location: string) => number | null,
  userNames: Map<number, string>
): { summary: InstanceSummary; snapshot: typeof instanceStatusSnapshots.$inferSelect | undefined } {
  const def = getGameDefinition(instance.gameType);
  const server = getActiveServer(instance.id);
  const activeJobRow = db
    .select()
    .from(actionJobs)
    .where(and(eq(actionJobs.instanceId, instance.id), inArray(actionJobs.status, ["running", "queued"])))
    .orderBy(desc(actionJobs.status), actionJobs.createdAt)
    .get();
  const snapshot = server
    ? db
        .select()
        .from(instanceStatusSnapshots)
        .where(eq(instanceStatusSnapshots.instanceId, instance.id))
        .orderBy(desc(instanceStatusSnapshots.createdAt))
        .get()
    : undefined;
  // Ignore snapshots from a previous VM.
  const freshSnapshot = snapshot && server && snapshot.createdAt >= server.createdAt ? snapshot : undefined;

  let state: OverallState;
  if (activeJobRow) state = "busy";
  else if (!server) state = "offline";
  else if (!freshSnapshot) state = "starting";
  else state = (freshSnapshot.gameStatus as GameStatus) === "running" ? "online" : (freshSnapshot.gameStatus as OverallState);

  const hostname = instanceHostname(instance);
  const host = hostname ?? server?.ipV4 ?? null;
  const address =
    host && def ? (def.showPortInAddress ? `${host}:${def.connectPort}` : host) : host;

  let idleShutdownAt: string | null = null;
  if (server && instance.idleDeleteAfterMinutes > 0 && def?.features.playerCount && !activeJobRow) {
    const since = Math.max(instance.lastActivityAt?.getTime() ?? 0, server.createdAt.getTime());
    if (!freshSnapshot?.playerCount) {
      idleShutdownAt = new Date(since + instance.idleDeleteAfterMinutes * 60_000).toISOString();
    }
  }

  return {
    snapshot: freshSnapshot,
    summary: {
      id: instance.id,
      name: instance.name,
      slug: instance.slug,
      gameType: instance.gameType,
      gameLabel: def?.label ?? getGameArt(instance.gameType).label,
      supported: Boolean(def),
      state,
      activeJob: activeJobRow ? toJobView(activeJobRow, userNames) : null,
      players: freshSnapshot?.playerCount ?? null,
      maxPlayers: freshSnapshot?.maxPlayers ?? null,
      address: server ? address : hostname,
      ip: server?.ipV4 ?? null,
      serverType: instance.activeServerType,
      region: instance.region,
      pricePerHour: price(instance.activeServerType, instance.region),
      idleMinutes: instance.idleDeleteAfterMinutes,
      idleShutdownAt,
      hostSince: server?.createdAt.toISOString() ?? null,
    },
  };
}

export async function listInstanceSummaries(): Promise<InstanceSummary[]> {
  const instances = db
    .select()
    .from(gameInstances)
    .where(isNull(gameInstances.archivedAt))
    .orderBy(gameInstances.name)
    .all();
  const price = await priceLookup();
  const names = userNameMap([]);
  return instances.map((instance) => buildSummary(instance, price, names).summary);
}

export async function getInstanceDetail(instanceId: number): Promise<InstanceDetail | null> {
  const instance = db
    .select()
    .from(gameInstances)
    .where(and(eq(gameInstances.id, instanceId), isNull(gameInstances.archivedAt)))
    .get();
  if (!instance) return null;

  const recentJobRows = db
    .select()
    .from(actionJobs)
    .where(eq(actionJobs.instanceId, instance.id))
    .orderBy(desc(actionJobs.createdAt))
    .limit(15)
    .all();
  const names = userNameMap(recentJobRows.map((j) => j.requestedByUserId));
  const { summary, snapshot } = buildSummary(instance, await priceLookup(), names);
  const recentJobs = recentJobRows.map((j) => toJobView(j, names));
  const lastFinished = recentJobs.find((j) => j.status === "succeeded" || j.status === "failed");

  const profile = readProfile(instance.gameType, instance.configProfile);
  const volume = getVolume(instance.id);
  const raw = (snapshot?.rawJson ?? {}) as { diskUsedBytes?: number | null; diskTotalBytes?: number | null };

  return {
    ...summary,
    subdomain: instance.subdomain,
    domain: getCloudflareConfig()?.domain ?? null,
    settings: profile.settings,
    minecraft: profile.minecraft ?? null,
    backupRetention: instance.backupRetention,
    backupOnHibernate: instance.backupOnHibernate,
    volume:
      volume && volume.status !== "deleted"
        ? { sizeGb: volume.sizeGb, usedBytes: raw.diskUsedBytes ?? null, totalBytes: raw.diskTotalBytes ?? null }
        : null,
    recentJobs,
    lastFailedJob: lastFinished?.status === "failed" ? lastFinished : null,
    backups: db
      .select()
      .from(gameBackups)
      .where(eq(gameBackups.instanceId, instance.id))
      .orderBy(desc(gameBackups.createdAt))
      .all()
      .map((b) => ({
        id: b.id,
        fileName: b.fileName,
        sizeBytes: b.sizeBytes,
        kind: b.kind,
        createdAt: b.createdAt.toISOString(),
      })),
    lastHeartbeat: snapshot?.createdAt.toISOString() ?? null,
    createdAt: instance.createdAt.toISOString(),
  };
}

export function getJobLog(jobId: number, instanceId: number) {
  const job = db
    .select({ log: actionJobs.log, status: actionJobs.status, progress: actionJobs.progress })
    .from(actionJobs)
    .where(and(eq(actionJobs.id, jobId), eq(actionJobs.instanceId, instanceId)))
    .get();
  return job ?? null;
}
