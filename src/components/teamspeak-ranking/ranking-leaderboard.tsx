"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { RankingPodium } from "@/components/teamspeak-ranking/ranking-podium";
import { RankingRow } from "@/components/teamspeak-ranking/ranking-row";
import { RankingUserSearch } from "@/components/teamspeak-ranking/ranking-user-search";
import { ServerUsageChart } from "@/components/teamspeak-ranking/server-usage-chart";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/teamspeak/format-duration";
import type { LeaderboardPeriod } from "@/lib/teamspeak/leaderboard-period";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS: LeaderboardPeriod[] = ["week", "month", "year", "all"];
const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

type LeaderboardEntry = {
  rank: number;
  uuid: string;
  nickname: string;
  onlineSeconds: number;
  prestige: number;
  level: number;
  levelTierName: string | null;
  isOnline: boolean;
};

type LeaderboardPayload = {
  period: LeaderboardPeriod;
  periodKey: string;
  generatedAt: string;
  entries: LeaderboardEntry[];
  summary: {
    activeUsers: number;
    totalSeconds: number;
  };
  matchCount: number;
};

export function RankingLeaderboard() {
  const t = useTranslations("ranking");
  const locale = useLocale();
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const requestId = useRef(0);
  const dataRef = useRef(data);
  const queryRef = useRef(query);
  useEffect(() => {
    dataRef.current = data;
    queryRef.current = query;
  }, [data, query]);

  useEffect(() => {
    const trimmed = search.trim();
    const next = trimmed.length >= 2 ? trimmed : "";
    const handle = window.setTimeout(() => {
      if (queryRef.current === next) return;
      queryRef.current = next;
      setQuery(next);
      setPageSize(PAGE_SIZE);
    }, next ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (!dataRef.current) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        period,
        limit: String(pageSize),
      });
      if (query.length >= 2) params.set("search", query);
      const res = await fetch(`/api/teamspeak/ranking?${params.toString()}`);
      const json = (await res.json()) as { data?: LeaderboardPayload; error?: string };
      if (id !== requestId.current) return;
      if (!res.ok || !json.data) {
        throw new Error(t("loadFailed"));
      }
      setData(json.data);
      setAppliedSearch(query.length >= 2 ? query : "");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error && e.message ? e.message : t("loadFailed"));
      if (!dataRef.current) setData(null);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [period, query, pageSize, t]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const showPodium = !appliedSearch && data && data.entries.length >= 3;
  const podium = showPodium ? data!.entries.slice(0, 3) : [];
  const rest = showPodium ? data!.entries.slice(3) : (data?.entries ?? []);
  const hasMore = Boolean(data && data.entries.length < data.matchCount);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8">
      <ServerUsageChart />

      <div className="sticky top-[var(--header-height)] z-40 border-b border-border/60 bg-background/95 py-3 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="inline-flex flex-wrap rounded-xl border border-border/80 bg-muted/30 p-1"
            role="tablist"
            aria-label={t("periodLabel")}
          >
            {PERIOD_OPTIONS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={period === key}
                onClick={() => {
                  setPeriod(key);
                  setPageSize(PAGE_SIZE);
                }}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                  period === key
                    ? "bg-[var(--tretu-accent)] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(`periods.${key}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <RankingUserSearch value={search} onChange={setSearch} />
            {appliedSearch && data && (
              <p className="text-sm text-muted-foreground">
                {data.entries.length >= data.matchCount
                  ? t("matches", { count: data.matchCount })
                  : t("matchesOf", { shown: data.entries.length, total: data.matchCount })}
              </p>
            )}
          </div>
        </div>
      </div>

      {data && !appliedSearch && (
        <p className="text-center text-sm text-muted-foreground">
          {period !== "all" ? (
            <>
              {t("activity")} <span className="font-medium text-foreground">{data.periodKey}</span>
              {" · "}
            </>
          ) : null}
          {t("activeUsers", { count: data.summary.activeUsers })} ·{" "}
          {t.rich("total", {
            duration: formatDuration(data.summary.totalSeconds, locale),
            strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
      )}

      {loading && !data && (
        <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-12 text-center text-sm text-muted-foreground">
          {t("loading")}
        </p>
      )}

      {error && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-8 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {data && data.entries.length === 0 && !loading && (
        <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}

      {data && data.entries.length > 0 && (
        <>
          {showPodium && <RankingPodium entries={podium} />}
          <ol className="space-y-2">
            {rest.map((entry) => (
              <RankingRow key={entry.uuid} entry={entry} emphasized={Boolean(appliedSearch)} />
            ))}
          </ol>
          {hasMore && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={refreshing}
                onClick={() => setPageSize((size) => size + PAGE_SIZE)}
              >
                {t("showMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
