"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Activity, TrendingUp, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  USAGE_RANGE_LABELS,
  type UsageRange,
} from "@/lib/teamspeak/server-usage-types";
import { cn } from "@/lib/utils";

type ServerUsagePayload = {
  range: UsageRange;
  rangeHours: number;
  generatedAt: string;
  points: { bucket: string; label: string; online: number }[];
  stats: {
    onlineNow: number;
    peakInRange: number;
    averageInRange: number;
  };
  hasHistory: boolean;
};

const RANGE_OPTIONS: { key: UsageRange; label: string }[] = [
  { key: "24h", label: "24 Std." },
  { key: "7d", label: "7 Tage" },
  { key: "30d", label: "30 Tage" },
];

const chartConfig = {
  online: {
    label: "Spieler online",
    color: "var(--tretu-accent)",
  },
} satisfies ChartConfig;

function StatTile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-3",
        className
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-[var(--tretu-accent)]" aria-hidden />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
    </div>
  );
}

export function ServerUsageChart() {
  const [range, setRange] = useState<UsageRange>("24h");
  const [data, setData] = useState<ServerUsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teamspeak/usage?range=${range}`);
      const json = (await res.json()) as { data?: ServerUsagePayload; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Nutzungsdaten konnten nicht geladen werden");
      }
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Card className="overflow-hidden border-border/70 bg-card/90 dark:bg-card/50">
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
            <Activity
              className="h-5 w-5 shrink-0 text-[var(--tretu-accent)]"
              aria-hidden
            />
            <span className="truncate">Server-Auslastung</span>
          </CardTitle>
          <div
            className="inline-flex shrink-0 rounded-xl border border-border/80 bg-muted/30 p-1"
            role="tablist"
            aria-label="Zeitraum"
          >
            {RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={range === key}
                onClick={() => setRange(key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                  range === key
                    ? "bg-[var(--tretu-accent)] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <CardDescription>
          Alle verbundenen Spieler — {USAGE_RANGE_LABELS[range]}
          {!data?.hasHistory && data ? " (Verlauf startet mit dem Rank-Worker)" : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data && !loading && (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile icon={Users} label="Jetzt online" value={data.stats.onlineNow} />
            <StatTile icon={TrendingUp} label="Peak" value={data.stats.peakInRange} />
            <StatTile
              icon={Activity}
              label="Ø im Zeitraum"
              value={data.stats.averageInRange}
            />
          </div>
        )}

        {loading && (
          <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 text-sm text-muted-foreground">
            Chart wird geladen…
          </div>
        )}

        {error && !loading && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            {error}
          </p>
        )}

        {!loading && !error && data && data.points.length > 0 && (
          <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
            <AreaChart
              data={data.points}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fillTretuOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-online)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--color-online)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border/50" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={range === "30d" ? 40 : range === "7d" ? 32 : 28}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                allowDecimals={false}
                width={32}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--tretu-accent)", strokeWidth: 1, strokeOpacity: 0.35 }}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Area
                type="monotone"
                dataKey="online"
                stroke="var(--color-online)"
                strokeWidth={2}
                fill="url(#fillTretuOnline)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--color-online)",
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
