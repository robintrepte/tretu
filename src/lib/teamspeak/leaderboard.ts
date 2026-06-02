import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { db } from "@/db";
import { tsRankTiers, tsUsers } from "@/db/schema";
import type { LeaderboardPeriod } from "@/lib/teamspeak/leaderboard-period";
import {
  MONTHLY_ACTIVE_WINDOW_SEC,
  WEEKLY_ACTIVE_WINDOW_SEC,
  currentPeriodKey,
  currentWeekKey,
  currentYearKey,
} from "@/lib/teamspeak/period";
import { formatRankLabel } from "@/lib/teamspeak/prestige-progress";
import { unescapeTsQueryString } from "@/lib/teamspeak/query-escape";

export type { LeaderboardPeriod } from "@/lib/teamspeak/leaderboard-period";

export type LeaderboardEntry = {
  rank: number;
  uuid: string;
  nickname: string;
  onlineSeconds: number;
  /** @deprecated Use prestige + level + levelTierName with RankDisplay */
  tierName: string | null;
  prestige: number;
  level: number;
  levelTierName: string | null;
  isOnline: boolean;
};

export type LeaderboardResult = {
  period: LeaderboardPeriod;
  periodKey: string;
  generatedAt: string;
  entries: LeaderboardEntry[];
  summary: {
    activeUsers: number;
    totalSeconds: number;
  };
};

function resolveLeaderboardQuery(period: LeaderboardPeriod, now = new Date()) {
  switch (period) {
    case "week": {
      const periodKey = currentWeekKey(now);
      return {
        periodKey,
        orderColumn: tsUsers.weekOnlineSeconds,
        extraFilters: [
          eq(tsUsers.weekKey, periodKey),
          gte(
            tsUsers.lastSeenAt,
            new Date(now.getTime() - WEEKLY_ACTIVE_WINDOW_SEC * 1000)
          ),
        ] as SQL[],
      };
    }
    case "year": {
      const periodKey = currentYearKey(now);
      return {
        periodKey,
        orderColumn: tsUsers.yearOnlineSeconds,
        extraFilters: [eq(tsUsers.yearKey, periodKey)] as SQL[],
      };
    }
    case "all":
      return {
        periodKey: "all",
        orderColumn: tsUsers.totalOnlineSeconds,
        extraFilters: [] as SQL[],
      };
    case "month":
    default: {
      const periodKey = currentPeriodKey(now);
      return {
        periodKey,
        orderColumn: tsUsers.periodOnlineSeconds,
        extraFilters: [
          eq(tsUsers.periodKey, periodKey),
          gte(
            tsUsers.lastSeenAt,
            new Date(now.getTime() - MONTHLY_ACTIVE_WINDOW_SEC * 1000)
          ),
        ] as SQL[],
      };
    }
  }
}

export async function fetchLeaderboard(params: {
  period: LeaderboardPeriod;
  limit: number;
  search?: string;
}): Promise<LeaderboardResult> {
  const now = new Date();
  const { periodKey, orderColumn, extraFilters } = resolveLeaderboardQuery(params.period, now);
  const limit = Math.min(Math.max(params.limit, 1), 100);

  const search = params.search?.trim();
  const searchFilter =
    search && search.length >= 2 ? like(tsUsers.nickname, `%${search}%`) : undefined;

  const baseFilters = [eq(tsUsers.excepted, false), searchFilter, ...extraFilters].filter(
    Boolean
  );

  const rows = await db
    .select({
      uuid: tsUsers.uuid,
      nickname: tsUsers.nickname,
      onlineSeconds: orderColumn,
      prestige: tsUsers.prestige,
      level: tsUsers.currentLevel,
      levelTierName: tsRankTiers.name,
      isOnline: tsUsers.isOnline,
    })
    .from(tsUsers)
    .leftJoin(tsRankTiers, eq(tsUsers.currentTierId, tsRankTiers.id))
    .where(and(...baseFilters))
    .orderBy(
      desc(tsUsers.prestige),
      desc(tsUsers.currentLevel),
      desc(orderColumn),
      desc(tsUsers.lastSeenAt)
    )
    .limit(limit);

  const summaryRows = await db
    .select({
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${orderColumn}), 0)`,
    })
    .from(tsUsers)
    .where(and(...baseFilters));

  const summary = summaryRows[0] ?? { count: 0, total: 0 };

  return {
    period: params.period,
    periodKey,
    generatedAt: now.toISOString(),
    entries: rows.map((row, index) => ({
      rank: index + 1,
      uuid: row.uuid,
      nickname: unescapeTsQueryString(row.nickname),
      onlineSeconds: row.onlineSeconds,
      prestige: row.prestige,
      level: row.level,
      tierName: formatRankLabel(row.prestige, row.level, row.levelTierName),
      levelTierName: row.levelTierName,
      isOnline: row.isOnline,
    })),
    summary: {
      activeUsers: Number(summary.count),
      totalSeconds: Number(summary.total),
    },
  };
}
