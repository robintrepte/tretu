"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RankingPodium } from "@/components/teamspeak-ranking/ranking-podium";
import { RankingRow } from "@/components/teamspeak-ranking/ranking-row";
import { RankingUserSearch } from "@/components/teamspeak-ranking/ranking-user-search";
import { ServerUsageChart } from "@/components/teamspeak-ranking/server-usage-chart";
import { Button } from "@/components/ui/button";
import { formatDurationGerman } from "@/lib/teamspeak/format-duration";
import {
  LEADERBOARD_PERIOD_LABELS,
  type LeaderboardPeriod,
} from "@/lib/teamspeak/leaderboard-period";
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

function trefferLabel(shown: number, total: number): string {
  if (shown >= total) return total === 1 ? "1 Treffer" : `${total} Treffer`;
  return `${shown} von ${total} Treffern`;
}

export function RankingLeaderboard() {
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
  dataRef.current = data;
  queryRef.current = query;

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
        throw new Error(json.error ?? "Ranking konnte nicht geladen werden");
      }
      setData(json.data);
      setAppliedSearch(query.length >= 2 ? query : "");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      if (!dataRef.current) setData(null);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [period, query, pageSize]);

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
            aria-label="Ranking-Zeitraum"
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
                {LEADERBOARD_PERIOD_LABELS[key]}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <RankingUserSearch value={search} onChange={setSearch} />
            {appliedSearch && data && (
              <p className="text-sm text-muted-foreground">
                {trefferLabel(data.entries.length, data.matchCount)}
              </p>
            )}
          </div>
        </div>
      </div>

      {data && !appliedSearch && (
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

      {loading && !data && (
        <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-12 text-center text-sm text-muted-foreground">
          Ranking wird geladen…
        </p>
      )}

      {error && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-8 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {data && data.entries.length === 0 && !loading && (
        <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-12 text-center text-sm text-muted-foreground">
          Keine Einträge gefunden.
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
                Mehr anzeigen
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
