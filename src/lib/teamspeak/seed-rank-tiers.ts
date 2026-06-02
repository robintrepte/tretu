import { parseRankupDefinition } from "@/lib/teamspeak/rank-definition";
import { MAX_LEVEL, MAX_PRESTIGE } from "@/lib/teamspeak/prestige-progress";
import { parseRanksystemDumpFile } from "@/lib/teamspeak/parse-ranksystem-dump";

export type SeedRankTier = {
  tierKind: "level" | "prestige";
  sortOrder: number;
  levelNumber: number | null;
  prestigeLevel: number | null;
  name: string;
  minTotalSeconds: number;
  serverGroupId: number;
};

const PRESTIGE_SGIDS: Record<number, number> = {
  1: 149,
  2: 150,
  3: 151,
};

/** Build 100 level tiers + 3 prestige tiers from legacy rankup_definition. */
export function buildSeedRankTiers(dumpPath: string): SeedRankTier[] {
  const parsed = parseRanksystemDumpFile(dumpPath);
  const all = parseRankupDefinition(parsed.rankupDefinition);

  const levelDefs = all.filter((t) => !t.prestigeFlag).slice(0, MAX_LEVEL);
  const prestigeDefs = all.filter((t) => t.prestigeFlag);

  const levels: SeedRankTier[] = levelDefs.map((tier, index) => {
    const levelNumber = index + 1;
    const name = parsed.groups.get(tier.serverGroupId) ?? `Level ${levelNumber}`;
    return {
      tierKind: "level" as const,
      sortOrder: index,
      levelNumber,
      prestigeLevel: null,
      name,
      minTotalSeconds: tier.minTotalSeconds,
      serverGroupId: tier.serverGroupId,
    };
  });

  const prestiges: SeedRankTier[] = [];
  for (let p = 1; p <= MAX_PRESTIGE; p++) {
    const fromDef = prestigeDefs[p - 1];
    const sgid = fromDef?.serverGroupId ?? PRESTIGE_SGIDS[p] ?? 0;
    const name = parsed.groups.get(sgid) ?? `Prestige ${p}`;
    prestiges.push({
      tierKind: "prestige",
      sortOrder: p,
      levelNumber: null,
      prestigeLevel: p,
      name,
      minTotalSeconds: 0,
      serverGroupId: sgid,
    });
  }

  return [...levels, ...prestiges];
}

export function buildSeedRankTiersFromSqlFile(dumpPath: string): SeedRankTier[] {
  return buildSeedRankTiers(dumpPath);
}

/** Optional: read rankup from env-only string for tests. */
export function buildSeedRankTiersFromDefinition(
  rankupDefinition: string,
  groupNames: Map<number, string>
): SeedRankTier[] {
  const all = parseRankupDefinition(rankupDefinition);
  const levelDefs = all.filter((t) => !t.prestigeFlag).slice(0, MAX_LEVEL);
  const prestigeDefs = all.filter((t) => t.prestigeFlag);

  const levels: SeedRankTier[] = levelDefs.map((tier, index) => {
    const levelNumber = index + 1;
    return {
      tierKind: "level" as const,
      sortOrder: index,
      levelNumber,
      prestigeLevel: null,
      name: groupNames.get(tier.serverGroupId) ?? `Level ${levelNumber}`,
      minTotalSeconds: tier.minTotalSeconds,
      serverGroupId: tier.serverGroupId,
    };
  });

  const prestiges: SeedRankTier[] = [];
  for (let p = 1; p <= MAX_PRESTIGE; p++) {
    const fromDef = prestigeDefs[p - 1];
    const sgid = fromDef?.serverGroupId ?? PRESTIGE_SGIDS[p] ?? 0;
    prestiges.push({
      tierKind: "prestige",
      sortOrder: p,
      levelNumber: null,
      prestigeLevel: p,
      name: groupNames.get(sgid) ?? `Prestige ${p}`,
      minTotalSeconds: 0,
      serverGroupId: sgid,
    });
  }

  return [...levels, ...prestiges];
}
