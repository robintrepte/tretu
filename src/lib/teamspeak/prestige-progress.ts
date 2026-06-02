import type { DbRankTier } from "@/lib/teamspeak/ranks";

export const MAX_LEVEL = 100;
export const MAX_PRESTIGE = 3;

export type RankProgress = {
  prestige: number;
  cycleOnlineSeconds: number;
  level: number;
  levelTier: DbRankTier | null;
  prestigeTier: DbRankTier | null;
  /** True when prestige just increased this tick (for notifications later). */
  prestigeGained: boolean;
};

export function getLevelTiers(tiers: DbRankTier[]): DbRankTier[] {
  return tiers
    .filter((t) => t.tierKind === "level")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getPrestigeTiers(tiers: DbRankTier[]): DbRankTier[] {
  return tiers
    .filter((t) => t.tierKind === "prestige")
    .sort((a, b) => (a.prestigeLevel ?? 0) - (b.prestigeLevel ?? 0));
}

/** All prestige server groups that should stay on the client (1 … current prestige). */
export function getPrestigeTiersUpTo(
  prestigeTiers: DbRankTier[],
  prestige: number
): DbRankTier[] {
  if (prestige <= 0) return [];
  return prestigeTiers.filter((t) => {
    const p = t.prestigeLevel ?? 0;
    return p >= 1 && p <= prestige;
  });
}

export function resolveLevelFromCycleSeconds(
  levelTiers: DbRankTier[],
  cycleSeconds: number
): { level: number; tier: DbRankTier | null } {
  let level = 0;
  let tier: DbRankTier | null = null;

  for (const row of levelTiers) {
    if (cycleSeconds >= row.minTotalSeconds) {
      level = row.levelNumber ?? row.sortOrder + 1;
      tier = row;
    }
  }

  return { level: Math.min(level, MAX_LEVEL), tier };
}

export function getLevel100Threshold(levelTiers: DbRankTier[]): number {
  const level100 = levelTiers.find((t) => (t.levelNumber ?? t.sortOrder + 1) === MAX_LEVEL);
  return level100?.minTotalSeconds ?? 0;
}

/** Apply one poll interval; may trigger prestige and cycle reset. */
export function advanceRankProgress(params: {
  prestige: number;
  cycleOnlineSeconds: number;
  addedSeconds: number;
  levelTiers: DbRankTier[];
  prestigeTiers: DbRankTier[];
}): RankProgress {
  let prestige = Math.min(Math.max(params.prestige, 0), MAX_PRESTIGE);
  let cycle = params.cycleOnlineSeconds + params.addedSeconds;
  let prestigeGained = false;

  const level100Threshold = getLevel100Threshold(params.levelTiers);

  while (prestige < MAX_PRESTIGE && level100Threshold > 0 && cycle >= level100Threshold) {
    prestige += 1;
    cycle -= level100Threshold;
    prestigeGained = true;
  }

  if (prestige >= MAX_PRESTIGE && level100Threshold > 0 && cycle >= level100Threshold) {
    cycle = level100Threshold;
  }

  const { level, tier: levelTier } = resolveLevelFromCycleSeconds(params.levelTiers, cycle);
  const prestigeTier =
    prestige > 0
      ? (params.prestigeTiers.find((t) => t.prestigeLevel === prestige) ?? null)
      : null;

  return {
    prestige,
    cycleOnlineSeconds: cycle,
    level,
    levelTier,
    prestigeTier,
    prestigeGained,
  };
}

/** Convert legacy all-time seconds into prestige + cycle (for import / one-off migration). */
export function totalSecondsToPrestigeProgress(
  totalOnlineSeconds: number,
  levelTiers: DbRankTier[],
  prestigeTiers: DbRankTier[] = []
): Pick<RankProgress, "prestige" | "cycleOnlineSeconds" | "level" | "levelTier" | "prestigeTier"> {
  const level100Threshold = getLevel100Threshold(levelTiers);
  if (level100Threshold <= 0) {
    return {
      prestige: 0,
      cycleOnlineSeconds: totalOnlineSeconds,
      level: 0,
      levelTier: null,
      prestigeTier: null,
    };
  }

  let prestige = Math.min(Math.floor(totalOnlineSeconds / level100Threshold), MAX_PRESTIGE);
  let cycle = totalOnlineSeconds - prestige * level100Threshold;

  if (prestige >= MAX_PRESTIGE) {
    cycle = Math.min(cycle, level100Threshold);
  }

  const { level, tier: levelTier } = resolveLevelFromCycleSeconds(levelTiers, cycle);
  const prestigeTier =
    prestige > 0 ? (prestigeTiers.find((t) => t.prestigeLevel === prestige) ?? null) : null;

  return {
    prestige,
    cycleOnlineSeconds: cycle,
    level,
    levelTier,
    prestigeTier,
  };
}

export function formatRankLabel(prestige: number, level: number, levelTierName: string | null): string {
  const parts: string[] = [];
  if (prestige > 0) parts.push(`Prestige ${prestige}`);
  if (level > 0) {
    parts.push(levelTierName ?? `Level ${level}`);
  } else if (prestige > 0) {
    parts.push("Level 0");
  } else {
    parts.push(levelTierName ?? "Level 0");
  }
  return parts.join(" · ");
}
