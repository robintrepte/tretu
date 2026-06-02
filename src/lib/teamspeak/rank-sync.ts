import { eq } from "drizzle-orm";

import { db } from "@/db";
import { tsUsers } from "@/db/schema";
import type { TeamSpeakQueryClient } from "@/lib/teamspeak/query-client";
import { getPrestigeTiersUpTo } from "@/lib/teamspeak/prestige-progress";
import { loadManagedServerGroupIds, type DbRankTier } from "@/lib/teamspeak/ranks";
import { normalizeTsUuid } from "@/lib/teamspeak/query-escape";

function isIgnorableGroupSyncError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("already") ||
    msg.includes("not assigned") ||
    msg.includes("not found") ||
    msg.includes("empty result") ||
    msg.includes("duplicate") ||
    msg.includes("id=2561") || // already in group (add)
    msg.includes("id=2563") || // client not in group (delete)
    msg.includes("id=2568") ||
    msg.includes("id=2610")
  );
}

function isFloodError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("id=524") || msg.toLowerCase().includes("flooding");
}

function isConnectionClosedError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("connection closed") || msg.includes("not connected");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groupCommandDelayMs(): number {
  const n = Number(process.env.TS_GROUP_CMD_DELAY_MS ?? 80);
  return Number.isFinite(n) && n >= 0 ? n : 80;
}

async function runGroupCommand(
  query: TeamSpeakQueryClient,
  action: () => Promise<void>,
  retries = 5
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await action();
      return;
    } catch (error) {
      if (isIgnorableGroupSyncError(error)) return;
      const retryable =
        attempt < retries && (isFloodError(error) || isConnectionClosedError(error));
      if (retryable) {
        if (isConnectionClosedError(error)) {
          await sleep(1500 * (attempt + 1));
          await query.reconnect();
        } else {
          await sleep(400 * 2 ** attempt);
        }
        continue;
      }
      throw error;
    }
  }
}

async function addGroupGraceful(
  query: TeamSpeakQueryClient,
  serverGroupId: number,
  clientDatabaseId: number
): Promise<void> {
  await runGroupCommand(query, () =>
    query.serverGroupAddClient(serverGroupId, clientDatabaseId)
  );
}

async function removeGroupGraceful(
  query: TeamSpeakQueryClient,
  serverGroupId: number,
  clientDatabaseId: number
): Promise<void> {
  await runGroupCommand(query, () =>
    query.serverGroupDelClient(serverGroupId, clientDatabaseId)
  );
}

async function syncLevelGroup(params: {
  query: TeamSpeakQueryClient;
  clientDatabaseId: number;
  levelTier: DbRankTier | null;
  levelTiers: DbRankTier[];
  managed: Set<number>;
  clientGroups: Set<number>;
}): Promise<number | null> {
  const newGroupId = params.levelTier?.serverGroupId ?? null;
  const delay = groupCommandDelayMs();

  for (const tier of params.levelTiers) {
    const groupId = tier.serverGroupId;
    if (!params.managed.has(groupId)) continue;
    if (groupId === newGroupId) continue;
    if (!params.clientGroups.has(groupId)) continue;
    await removeGroupGraceful(params.query, groupId, params.clientDatabaseId);
    params.clientGroups.delete(groupId);
    if (delay > 0) await sleep(delay);
  }

  if (newGroupId && !params.clientGroups.has(newGroupId)) {
    await addGroupGraceful(params.query, newGroupId, params.clientDatabaseId);
    params.clientGroups.add(newGroupId);
  }

  return newGroupId;
}

async function syncPrestigeStack(params: {
  query: TeamSpeakQueryClient;
  clientDatabaseId: number;
  prestige: number;
  prestigeTiers: DbRankTier[];
  managed: Set<number>;
  clientGroups: Set<number>;
}): Promise<number | null> {
  const keep = getPrestigeTiersUpTo(params.prestigeTiers, params.prestige);
  const keepIds = new Set(keep.map((t) => t.serverGroupId));
  const delay = groupCommandDelayMs();

  for (const tier of params.prestigeTiers) {
    const groupId = tier.serverGroupId;
    if (!params.managed.has(groupId)) continue;
    if (keepIds.has(groupId)) continue;
    if (!params.clientGroups.has(groupId)) continue;
    await removeGroupGraceful(params.query, groupId, params.clientDatabaseId);
    params.clientGroups.delete(groupId);
    if (delay > 0) await sleep(delay);
  }

  for (const tier of keep) {
    if (params.clientGroups.has(tier.serverGroupId)) continue;
    await addGroupGraceful(params.query, tier.serverGroupId, params.clientDatabaseId);
    params.clientGroups.add(tier.serverGroupId);
    if (delay > 0) await sleep(delay);
  }

  const highest = keep[keep.length - 1];
  return highest?.serverGroupId ?? null;
}

export async function syncUserRankGroups(params: {
  query: TeamSpeakQueryClient;
  clientDatabaseId: number;
  uuid: string;
  prestige: number;
  levelTier: DbRankTier | null;
  levelTiers: DbRankTier[];
  prestigeTiers: DbRankTier[];
}): Promise<{ levelGroupId: number | null; prestigeGroupId: number | null }> {
  const managed = await loadManagedServerGroupIds();
  const uuid = normalizeTsUuid(params.uuid);
  const clientGroups = await params.query.clientServerGroupIds(params.clientDatabaseId);

  const levelGroupId = await syncLevelGroup({
    query: params.query,
    clientDatabaseId: params.clientDatabaseId,
    levelTier: params.levelTier,
    levelTiers: params.levelTiers,
    managed,
    clientGroups,
  });

  const prestigeGroupId = await syncPrestigeStack({
    query: params.query,
    clientDatabaseId: params.clientDatabaseId,
    prestige: params.prestige,
    prestigeTiers: params.prestigeTiers,
    managed,
    clientGroups,
  });

  await db
    .update(tsUsers)
    .set({
      assignedServerGroupId: levelGroupId,
      assignedPrestigeGroupId: prestigeGroupId,
      updatedAt: new Date(),
    })
    .where(eq(tsUsers.uuid, uuid));

  return { levelGroupId, prestigeGroupId };
}

/** @deprecated Use syncUserRankGroups */
export async function syncUserServerGroup(params: {
  query: TeamSpeakQueryClient;
  clientDatabaseId: number;
  uuid: string;
  previousGroupId: number | null;
  newTier: DbRankTier | null;
}): Promise<number | null> {
  const result = await syncUserRankGroups({
    query: params.query,
    clientDatabaseId: params.clientDatabaseId,
    uuid: params.uuid,
    prestige: 0,
    levelTier: params.newTier,
    levelTiers: params.newTier ? [params.newTier] : [],
    prestigeTiers: [],
  });
  return result.levelGroupId;
}
