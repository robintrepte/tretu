export type RankTierDefinition = {
  sortOrder: number;
  minTotalSeconds: number;
  serverGroupId: number;
  prestigeFlag: boolean;
};

/** Parse ts-ranksystem `rankup_definition`: `seconds=>sgid=>flag` segments. */
export function parseRankupDefinition(raw: string): RankTierDefinition[] {
  const tiers: RankTierDefinition[] = [];
  let sortOrder = 0;

  for (const segment of raw.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const [secondsRaw, sgidRaw, flagRaw] = trimmed.split("=>");
    const minTotalSeconds = Number(secondsRaw);
    const serverGroupId = Number(sgidRaw);
    const prestigeFlag = flagRaw === "1";

    if (!Number.isFinite(minTotalSeconds) || !Number.isFinite(serverGroupId)) {
      continue;
    }

    tiers.push({
      sortOrder: sortOrder++,
      minTotalSeconds: Math.floor(minTotalSeconds),
      serverGroupId: Math.floor(serverGroupId),
      prestigeFlag,
    });
  }

  return tiers.sort((a, b) => a.minTotalSeconds - b.minTotalSeconds);
}

/** Highest tier the user qualifies for by total online seconds. */
export function resolveTierForSeconds(
  tiers: RankTierDefinition[],
  totalSeconds: number
): RankTierDefinition | null {
  if (!tiers.length) return null;

  let match: RankTierDefinition | null = null;
  for (const tier of tiers) {
    if (totalSeconds >= tier.minTotalSeconds) {
      match = tier;
    }
  }
  return match;
}

/** All managed rank server group IDs from tier definitions. */
export function managedServerGroupIds(tiers: RankTierDefinition[]): Set<number> {
  return new Set(tiers.map((t) => t.serverGroupId));
}
