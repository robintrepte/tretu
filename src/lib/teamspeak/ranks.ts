import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { tsRankTiers } from "@/db/schema";
import {
  getLevelTiers,
  getPrestigeTiers,
  resolveLevelFromCycleSeconds,
} from "@/lib/teamspeak/prestige-progress";

export type DbRankTier = typeof tsRankTiers.$inferSelect;

export async function loadRankTiersFromDb(): Promise<DbRankTier[]> {
  return db
    .select()
    .from(tsRankTiers)
    .orderBy(asc(tsRankTiers.tierKind), asc(tsRankTiers.sortOrder));
}

export async function loadLevelTiersFromDb(): Promise<DbRankTier[]> {
  const tiers = await loadRankTiersFromDb();
  return getLevelTiers(tiers);
}

export async function loadPrestigeTiersFromDb(): Promise<DbRankTier[]> {
  const tiers = await loadRankTiersFromDb();
  return getPrestigeTiers(tiers);
}

export async function loadManagedServerGroupIds(): Promise<Set<number>> {
  const tiers = await loadRankTiersFromDb();
  return new Set(tiers.map((t) => t.serverGroupId));
}

export function resolveLevelTierForCycle(
  levelTiers: DbRankTier[],
  cycleSeconds: number
): DbRankTier | null {
  return resolveLevelFromCycleSeconds(levelTiers, cycleSeconds).tier;
}

export async function getTierById(id: number): Promise<DbRankTier | undefined> {
  const rows = await db.select().from(tsRankTiers).where(eq(tsRankTiers.id, id)).limit(1);
  return rows[0];
}

export async function getPrestigeTierByLevel(
  prestigeTiers: DbRankTier[],
  prestige: number
): Promise<DbRankTier | null> {
  if (prestige <= 0) return null;
  return prestigeTiers.find((t) => t.prestigeLevel === prestige) ?? null;
}
