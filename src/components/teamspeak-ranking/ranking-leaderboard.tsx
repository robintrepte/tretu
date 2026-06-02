"use client";

import { useCallback, useEffect, useState } from "react";

import { RankingPodium } from "@/components/teamspeak-ranking/ranking-podium";
import { RankingRow } from "@/components/teamspeak-ranking/ranking-row";
import { RankingUserSearch } from "@/components/teamspeak-ranking/ranking-user-search";
import { ServerUsageChart } from "@/components/teamspeak-ranking/server-usage-chart";
import { formatDurationGerman } from "@/lib/teamspeak/format-duration";
import {
  LEADERBOARD_PERIOD_LABELS,
  type LeaderboardPeriod,
} from "@/lib/teamspeak/leaderboard-period";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS: LeaderboardPeriod[] = ["week", "month", "year", "all"];

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
};

export function RankingLeaderboard() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        period,
        limit: search.trim().length >= 2 ? "50" : "10",
      });
      if (search.trim().length >= 2) {
        params.set("search", search.trim());
      }
      const res = await fetch(`/api/teamspeak/ranking?${params.toString()}`);
      const json = (await res.json()) as { data?: LeaderboardPayload; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Ranking konnte nicht geladen werden");
      }
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, search]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const showPodium = !search.trim() && data && data.entries.length >= 3;
  const podium = showPodium ? data!.entries.slice(0, 3) : [];
  const rest = showPodium ? data!.entries.slice(3) : (data?.entries ?? []);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8">
      <ServerUsageChart />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex flex-wrap rounded-xl border border-border/80 bg-muted/30 p-1"
          role="tablist"
          aria-label="Ranking-Zeitraum"
        >
          {PERIOD_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              onClick={() => setPeriod(key)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                period === key
                  ? "bg-[var(--tretu-accent)] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {LEADERBOARD_PERIOD_LABELS[key]}
            </button>
          ))}
        </div>
        <RankingUserSearch value={search} onChange={setSearch} />
      </div>

      {data && !search.trim() && (
        <p className="text-center text-sm text-muted-foreground">
          {period !== "all" ? (
            <>
              Aktivität{" "}
              <span className="font-medium text-foreground">{data.periodKey}</span>
              {" · "}
            </>
          ) : null}
          {data.summary.activeUsers} aktive Nutzer ·{" "}
          <span className="font-medium text-foreground">
            {formatDurationGerman(data.summary.totalSeconds)}
          </span>{" "}
          gesamt
        </p>
      )}

      {loading && (
        <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-12 text-center text-sm text-muted-foreground">
          Ranking wird geladen…
        </p>
      )}

      {error && !loading && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-8 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && data && data.entries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-12 text-center text-sm text-muted-foreground">
          Keine Einträge gefunden.
        </p>
      )}

      {!loading && !error && data && data.entries.length > 0 && (
        <>
          {showPodium && <RankingPodium entries={podium} />}
          <ol className="space-y-2">
            {rest.map((entry) => (
              <RankingRow key={entry.uuid} entry={entry} />
            ))}
            {search.trim() && data.entries.length > 0 && (
              <p className="pt-2 text-center text-xs text-muted-foreground">
                {data.entries.length} Treffer
              </p>
            )}
          </ol>
        </>
      )}
    </div>
  );
}
