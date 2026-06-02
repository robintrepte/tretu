import { db } from "@/db";
import { tsRankTiers, tsUsers } from "@/db/schema";
import { currentPeriodKey, currentWeekKey, currentYearKey } from "@/lib/teamspeak/period";
import {
  formatRankLabel,
  totalSecondsToPrestigeProgress,
} from "@/lib/teamspeak/prestige-progress";
import { parseRanksystemDumpFile } from "@/lib/teamspeak/parse-ranksystem-dump";
import { getLevelTiers, getPrestigeTiers } from "@/lib/teamspeak/prestige-progress";
import { buildSeedRankTiers } from "@/lib/teamspeak/seed-rank-tiers";
import type { DbRankTier } from "@/lib/teamspeak/ranks";

export type ImportRanksystemResult = {
  tiers: number;
  levelTiers: number;
  prestigeTiers: number;
  users: number;
  skipped: number;
};

export async function seedRankTiersFromDump(dumpPath: string): Promise<DbRankTier[]> {
  await db.delete(tsRankTiers);
  const seeds = buildSeedRankTiers(dumpPath);
  const inserted: DbRankTier[] = [];

  for (const seed of seeds) {
    const [row] = await db
      .insert(tsRankTiers)
      .values({
        tierKind: seed.tierKind,
        sortOrder: seed.sortOrder,
        levelNumber: seed.levelNumber,
        prestigeLevel: seed.prestigeLevel,
        name: seed.name,
        minTotalSeconds: seed.minTotalSeconds,
        serverGroupId: seed.serverGroupId,
        removePreviousGroup: true,
        prestigeFlag: seed.tierKind === "prestige",
      })
      .returning();
    if (row) inserted.push(row);
  }

  return inserted;
}

export async function importRanksystemFromDump(
  dumpPath: string,
  options: { dryRun?: boolean } = {}
): Promise<ImportRanksystemResult> {
  const parsed = parseRanksystemDumpFile(dumpPath);
  const periodKey = currentPeriodKey();
  const weekKey = currentWeekKey();
  const yearKey = currentYearKey();
  let skipped = 0;

  const seeds = buildSeedRankTiers(dumpPath);

  if (options.dryRun) {
    const activeUsers = parsed.users.filter((u) => {
      const stats = parsed.statsByUuid.get(u.uuid);
      return stats && !stats.removed;
    });
    return {
      tiers: seeds.length,
      levelTiers: seeds.filter((s) => s.tierKind === "level").length,
      prestigeTiers: seeds.filter((s) => s.tierKind === "prestige").length,
      users: activeUsers.length,
      skipped: parsed.users.length - activeUsers.length,
    };
  }

  const insertedTiers = await seedRankTiersFromDump(dumpPath);
  const levelTiers = getLevelTiers(insertedTiers);
  const prestigeTiers = getPrestigeTiers(insertedTiers);

  let users = 0;
  for (const user of parsed.users) {
    const stats = parsed.statsByUuid.get(user.uuid);
    if (!stats || stats.removed) {
      skipped++;
      continue;
    }

    const progress = totalSecondsToPrestigeProgress(
      user.totalOnlineSeconds,
      levelTiers,
      prestigeTiers
    );
    const prestigeTier = progress.prestigeTier;

    await db
      .insert(tsUsers)
      .values({
        uuid: user.uuid,
        clientDbId: user.clientDbId,
        nickname: user.nickname,
        lastSeenAt: user.lastSeenAt,
        firstConnectedAt: user.firstConnectedAt,
        totalOnlineSeconds: user.totalOnlineSeconds,
        cycleOnlineSeconds: progress.cycleOnlineSeconds,
        prestige: progress.prestige,
        currentLevel: progress.level,
        periodOnlineSeconds: stats.periodOnlineSeconds,
        periodIdleSeconds: stats.periodIdleSeconds,
        periodKey,
        weekKey,
        weekOnlineSeconds: 0,
        yearKey,
        yearOnlineSeconds: 0,
        currentTierId: progress.levelTier?.id ?? null,
        assignedServerGroupId: progress.levelTier?.serverGroupId ?? null,
        assignedPrestigeGroupId: prestigeTier?.serverGroupId ?? null,
        excepted: user.excepted,
        isOnline: false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tsUsers.uuid,
        set: {
          clientDbId: user.clientDbId,
          nickname: user.nickname,
          lastSeenAt: user.lastSeenAt,
          firstConnectedAt: user.firstConnectedAt,
          totalOnlineSeconds: user.totalOnlineSeconds,
          cycleOnlineSeconds: progress.cycleOnlineSeconds,
          prestige: progress.prestige,
          currentLevel: progress.level,
          periodOnlineSeconds: stats.periodOnlineSeconds,
          periodIdleSeconds: stats.periodIdleSeconds,
          periodKey,
          weekKey,
          yearKey,
          currentTierId: progress.levelTier?.id ?? null,
          assignedServerGroupId: progress.levelTier?.serverGroupId ?? null,
          assignedPrestigeGroupId: prestigeTier?.serverGroupId ?? null,
          excepted: user.excepted,
          updatedAt: new Date(),
        },
      });

    users++;
  }

  return {
    tiers: insertedTiers.length,
    levelTiers: levelTiers.length,
    prestigeTiers: prestigeTiers.length,
    users,
    skipped,
  };
}

export { formatRankLabel };
