/**
 * Level curve: going from level L to L+1 costs 100 × L XP.
 * Total XP needed for level L = 50 × L × (L − 1)  →  L1: 0, L2: 100, L3: 300, L4: 600, L5: 1000,
 * L10: 4500, L20: 19000, L50: 122500.
 */
export const XP_STEP = 100;

export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (XP_STEP / 2) * l * (l - 1);
}

export function levelForXp(xp: number): number {
  const total = Math.max(0, Math.floor(xp));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * total) / XP_STEP)) / 2));
  // Guard against floating point drift at exact boundaries.
  while (xpForLevel(level + 1) <= total) level++;
  while (level > 1 && xpForLevel(level) > total) level--;
  return level;
}

export type LevelInfo = { level: number; xp: number; xpLevelStart: number; xpNextLevel: number };

export function levelInfo(xp: number): LevelInfo {
  const level = levelForXp(xp);
  return { level, xp: Math.max(0, Math.floor(xp)), xpLevelStart: xpForLevel(level), xpNextLevel: xpForLevel(level + 1) };
}
