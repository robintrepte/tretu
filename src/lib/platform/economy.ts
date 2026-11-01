/**
 * Tretu-Credits (TC) and XP economy. Every value can be overridden by env (integer).
 *
 * Welcome bonus and daily top-up mirror Saga (adventure.ai, lib/settings/registry.ts + lib/credits.ts):
 * - CREDITS_STARTING = 500: balance of a new account. The account counts as "topped up" on its
 *   creation day, so the first daily top-up is possible the next Europe/Berlin day.
 * - CREDITS_DAILY_TOPUP = 300: once per Europe/Berlin calendar day the balance is topped UP TO this
 *   value (granted = max(0, target - balance)); higher balances stay unchanged; 0 disables it.
 */
import { intEnv } from "@/lib/platform/env";

export const CURRENCY = "TC" as const;

export type Economy = {
  /** One-time welcome bonus when the wallet is created (Saga CREDITS_STARTING). */
  welcomeBonus: number;
  /** Daily top-up target (Saga CREDITS_DAILY_TOPUP); 0 = off. */
  dailyTopUpTarget: number;
  /** Credits per won game (`game.finished` result "win"). */
  gameWinReward: number;
  /** Max credits from game wins per user and Europe/Berlin day (all apps together). */
  gameWinRewardDailyCap: number;
  /** XP cap per user, app and Europe/Berlin day (badge XP is not capped). */
  xpDailyCapPerApp: number;
  /** XP for a finished game / extra XP for a win / extra XP for a completed campaign or run. */
  xpGamePlayed: number;
  xpGameWon: number;
  xpGameCompleted: number;
  /** XP for a new app-specific achievement. */
  xpAchievement: number;
};

export function getEconomy(): Economy {
  return {
    welcomeBonus: intEnv("TRETU_ECONOMY_WELCOME_BONUS", 500, 0, 1_000_000),
    dailyTopUpTarget: intEnv("TRETU_ECONOMY_DAILY_TOPUP", 300, 0, 1_000_000),
    gameWinReward: intEnv("TRETU_ECONOMY_GAME_WIN_REWARD", 5, 0, 10_000),
    gameWinRewardDailyCap: intEnv("TRETU_ECONOMY_GAME_WIN_DAILY_CAP", 25, 0, 100_000),
    xpDailyCapPerApp: intEnv("TRETU_XP_DAILY_CAP_PER_APP", 500, 0, 1_000_000),
    xpGamePlayed: intEnv("TRETU_XP_GAME_PLAYED", 10, 0, 10_000),
    xpGameWon: intEnv("TRETU_XP_GAME_WON", 15, 0, 10_000),
    xpGameCompleted: intEnv("TRETU_XP_GAME_COMPLETED", 40, 0, 10_000),
    xpAchievement: intEnv("TRETU_XP_ACHIEVEMENT", 25, 0, 10_000),
  };
}

/**
 * XP for `stat.increment` keys: `xp` per `per` units, computed on the running total so fractional
 * rates (e.g. 1 XP per 5 Minecraft minutes) never lose or double-count XP. Unknown keys give no XP.
 */
export const STAT_XP_RULES: Record<string, { xp: number; per: number }> = {
  "saga.turns": { xp: 2, per: 1 },
  "saga.worlds.created": { xp: 10, per: 1 },
  "saga.characters.created": { xp: 10, per: 1 },
  "hollowmere.creatures.befriended": { xp: 15, per: 1 },
  "hollowmere.days.played": { xp: 10, per: 1 },
  "minecraft.playtime.minutes": { xp: 1, per: 5 },
};

export function xpForStatIncrement(key: string, before: number, after: number): number {
  const rule = STAT_XP_RULES[key];
  if (!rule || after <= before) return 0;
  return (Math.floor(after / rule.per) - Math.floor(before / rule.per)) * rule.xp;
}

/** Wallet system accounts (counter-accounts of the double-entry ledger). */
export const SYSTEM_ACCOUNTS = {
  welcome: "system:welcome",
  daily: "system:daily",
  rewards: "system:rewards",
  purchases: "system:purchases",
  spend: "system:spend",
  grants: "system:grants",
  migration: "system:migration",
  adjust: "system:adjust",
} as const;
