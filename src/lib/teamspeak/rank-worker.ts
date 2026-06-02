import { and, eq, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { tsUsers, tsWorkerState } from "@/db/schema";
import { getTsRankConfig } from "@/lib/env/server";
import { currentPeriodKey, currentWeekKey, currentYearKey } from "@/lib/teamspeak/period";
import {
  advanceRankProgress,
  getLevelTiers,
  getPrestigeTiers,
} from "@/lib/teamspeak/prestige-progress";
import { TeamSpeakQueryClient } from "@/lib/teamspeak/query-client";
import { loadRankTiersFromDb } from "@/lib/teamspeak/ranks";
import { computeActivityCredit, parseAfkChannelMatchers } from "@/lib/teamspeak/active-time";
import { pruneServerSnapshots, recordServerSnapshot } from "@/lib/teamspeak/server-usage";
import { normalizeTsUuid } from "@/lib/teamspeak/query-escape";
import { syncUserRankGroups } from "@/lib/teamspeak/rank-sync";

async function upsertWorkerState(patch: {
  status: string;
  lastError?: string | null;
  lastPollAt?: Date;
  lastSuccessAt?: Date;
}) {
  const now = new Date();
  await db
    .insert(tsWorkerState)
    .values({
      id: 1,
      status: patch.status,
      lastError: patch.lastError ?? null,
      lastPollAt: patch.lastPollAt ?? now,
      lastSuccessAt: patch.lastSuccessAt ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: tsWorkerState.id,
      set: {
        status: patch.status,
        lastError: patch.lastError ?? null,
        lastPollAt: patch.lastPollAt ?? now,
        ...(patch.lastSuccessAt !== undefined ? { lastSuccessAt: patch.lastSuccessAt } : {}),
        updatedAt: now,
      },
    });
}

async function rolloverMonthIfNeeded(newKey: string) {
  const sample = await db.select({ periodKey: tsUsers.periodKey }).from(tsUsers).limit(1);
  if (!sample[0]?.periodKey || sample[0].periodKey === newKey) return;

  await db
    .update(tsUsers)
    .set({
      periodKey: newKey,
      periodOnlineSeconds: 0,
      periodIdleSeconds: 0,
      updatedAt: new Date(),
    })
    .where(sql`period_key != ${newKey}`);
}

async function rolloverWeekIfNeeded(newKey: string) {
  const sample = await db.select({ weekKey: tsUsers.weekKey }).from(tsUsers).limit(1);
  if (!sample[0]?.weekKey || sample[0].weekKey === newKey) return;

  await db
    .update(tsUsers)
    .set({
      weekKey: newKey,
      weekOnlineSeconds: 0,
      updatedAt: new Date(),
    })
    .where(sql`week_key != ${newKey}`);
}

async function rolloverYearIfNeeded(newKey: string) {
  const sample = await db.select({ yearKey: tsUsers.yearKey }).from(tsUsers).limit(1);
  if (!sample[0]?.yearKey || sample[0].yearKey === newKey) return;

  await db
    .update(tsUsers)
    .set({
      yearKey: newKey,
      yearOnlineSeconds: 0,
      updatedAt: new Date(),
    })
    .where(sql`year_key != ${newKey}`);
}

function addBucketSeconds(
  storedKey: string | null | undefined,
  storedSeconds: number | null | undefined,
  currentKey: string,
  added: number
): number {
  return storedKey === currentKey ? (storedSeconds ?? 0) + added : added;
}

export async function runTsRankTick(): Promise<{ online: number } | null> {
  const config = getTsRankConfig();
  if (!config.enabled) {
    await upsertWorkerState({ status: "disabled", lastError: "TS rank worker not configured" });
    return null;
  }

  const pollIntervalSec = config.pollIntervalSec;
  const periodKey = currentPeriodKey();
  const weekKey = currentWeekKey();
  const yearKey = currentYearKey();
  const allTiers = await loadRankTiersFromDb();
  const levelTiers = getLevelTiers(allTiers);
  const prestigeTiers = getPrestigeTiers(allTiers);

  if (!levelTiers.length) {
    await upsertWorkerState({ status: "error", lastError: "No level tiers configured" });
    return null;
  }

  await rolloverMonthIfNeeded(periodKey);
  await rolloverWeekIfNeeded(weekKey);
  await rolloverYearIfNeeded(yearKey);

  const query = new TeamSpeakQueryClient({
    host: config.queryHost,
    queryPort: config.queryPort,
    username: config.queryUser,
    password: config.queryPassword,
    virtualServerPort: config.virtualServerPort,
  });

  try {
    await upsertWorkerState({ status: "connecting", lastPollAt: new Date() });
    await query.connect();

    const online = await query.clientList();
    const channels = await query.channelList();
    const onlineUuids = new Set(
      online.map((c) => normalizeTsUuid(c.uniqueIdentifier))
    );
    const now = new Date();
    const activityConfig = {
      idleGraceSec: config.idleGraceSec,
      afkChannelMatchers: parseAfkChannelMatchers(config.afkChannelMatchers),
    };
    for (const client of online) {
      const uuid = normalizeTsUuid(client.uniqueIdentifier);
      const channelName = channels.get(client.channelId) ?? null;
      const credit = computeActivityCredit(
        pollIntervalSec,
        client.clientIdleTimeMs,
        channelName,
        activityConfig
      );
      let existing = await db
        .select()
        .from(tsUsers)
        .where(eq(tsUsers.uuid, uuid))
        .limit(1);

      if (!existing[0] && client.clientDatabaseId > 0) {
        existing = await db
          .select()
          .from(tsUsers)
          .where(
            and(
              eq(tsUsers.clientDbId, client.clientDatabaseId),
              eq(tsUsers.nickname, client.nickname)
            )
          )
          .limit(1);
      }

      const row = existing[0];
      const periodIdleAdd = credit.idleSeconds;
      const totalOnlineSeconds = (row?.totalOnlineSeconds ?? 0) + credit.activeSeconds;
      const periodOnlineSeconds = addBucketSeconds(
        row?.periodKey,
        row?.periodOnlineSeconds,
        periodKey,
        credit.activeSeconds
      );
      const weekOnlineSeconds = addBucketSeconds(
        row?.weekKey,
        row?.weekOnlineSeconds,
        weekKey,
        credit.activeSeconds
      );
      const yearOnlineSeconds = addBucketSeconds(
        row?.yearKey,
        row?.yearOnlineSeconds,
        yearKey,
        credit.activeSeconds
      );
      const periodIdleSeconds =
        row?.periodKey === periodKey
          ? (row.periodIdleSeconds ?? 0) + periodIdleAdd
          : periodIdleAdd;

      const progress = advanceRankProgress({
        prestige: row?.prestige ?? 0,
        cycleOnlineSeconds: row?.cycleOnlineSeconds ?? 0,
        addedSeconds: credit.activeSeconds,
        levelTiers,
        prestigeTiers,
      });

      await db
        .insert(tsUsers)
        .values({
          uuid,
          clientDbId: client.clientDatabaseId,
          nickname: client.nickname,
          lastSeenAt: now,
          firstConnectedAt: row?.firstConnectedAt ?? now,
          totalOnlineSeconds,
          cycleOnlineSeconds: progress.cycleOnlineSeconds,
          prestige: progress.prestige,
          currentLevel: progress.level,
          periodOnlineSeconds,
          periodIdleSeconds,
          periodKey,
          weekOnlineSeconds,
          weekKey,
          yearOnlineSeconds,
          yearKey,
          currentTierId: progress.levelTier?.id ?? null,
          assignedServerGroupId: row?.assignedServerGroupId ?? null,
          assignedPrestigeGroupId: row?.assignedPrestigeGroupId ?? null,
          excepted: row?.excepted ?? false,
          isOnline: true,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tsUsers.uuid,
          set: {
            clientDbId: client.clientDatabaseId,
            nickname: client.nickname,
            lastSeenAt: now,
            totalOnlineSeconds,
            cycleOnlineSeconds: progress.cycleOnlineSeconds,
            prestige: progress.prestige,
            currentLevel: progress.level,
            periodOnlineSeconds,
            periodIdleSeconds,
            periodKey,
            weekOnlineSeconds,
            weekKey,
            yearOnlineSeconds,
            yearKey,
            currentTierId: progress.levelTier?.id ?? null,
            isOnline: true,
            updatedAt: now,
          },
        });

      const levelChanged =
        progress.levelTier?.serverGroupId !== (row?.assignedServerGroupId ?? null);
      const prestigeChanged = progress.prestige !== (row?.prestige ?? 0);
      const uuidMismatch = row != null && row.uuid !== uuid;

      if (
        !(row?.excepted ?? false) &&
        (levelChanged || prestigeChanged || progress.prestigeGained || uuidMismatch)
      ) {
        await syncUserRankGroups({
          query,
          clientDatabaseId: client.clientDatabaseId,
          uuid,
          prestige: progress.prestige,
          levelTier: progress.levelTier,
          levelTiers,
          prestigeTiers,
        });
      }
    }

    if (onlineUuids.size === 0) {
      await db.update(tsUsers).set({ isOnline: false, updatedAt: now }).where(eq(tsUsers.isOnline, true));
    } else {
      await db
        .update(tsUsers)
        .set({ isOnline: false, updatedAt: now })
        .where(notInArray(tsUsers.uuid, [...onlineUuids]));
    }

    await recordServerSnapshot(online.length);
    if (Math.random() < 0.02) {
      await pruneServerSnapshots();
    }

    await upsertWorkerState({
      status: "ok",
      lastError: null,
      lastPollAt: now,
      lastSuccessAt: now,
    });

    return { online: online.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await upsertWorkerState({ status: "error", lastError: message, lastPollAt: new Date() });
    throw error;
  } finally {
    await query.disconnect();
  }
}
