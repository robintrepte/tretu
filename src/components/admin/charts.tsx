"use client";

import { useLocale } from "next-intl";
import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartStyle, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { INTL_LOCALE, resolveLocale } from "@/i18n/config";

/**
 * Categorical series colours in a fixed order (never cycled), light and dark steps validated for colour-vision
 * deficiencies against the card surfaces. Slot 1 stays close to the Tretu accent.
 */
const SERIES = [
  { light: "#eb6834", dark: "#d95926" },
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
] as const;

export type Series = { key: string; label: string };
type Point = { day: string } & Record<string, number | string>;

function useDayLabel() {
  const intl = INTL_LOCALE[resolveLocale(useLocale())];
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
    return (day: string) => fmt.format(new Date(`${day}T12:00:00Z`));
  }, [intl]);
}

function configFor(series: Series[]): ChartConfig {
  return Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, theme: { light: SERIES[i % SERIES.length].light, dark: SERIES[i % SERIES.length].dark } }])
  );
}

/** Legend under the chart (identity is never colour alone: swatch + label, values in the tooltip). */
function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: `var(--color-${s.key})` }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Daily series over time in the dashboard's chart style (dashed horizontal grid, no axis lines, crosshair
 * tooltip). One series: soft area in the accent colour; several: 2px lines with a legend.
 */
export function DailyChart({ data, series, height = 220, testId }: { data: Point[]; series: Series[]; height?: number; testId?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradient = `fill-${uid}`;
  const legendId = `legend-${uid}`;
  const dayLabel = useDayLabel();
  const config = useMemo(() => configFor(series), [series]);
  const points = useMemo(() => data.map((p) => ({ ...p, label: dayLabel(p.day) })), [data, dayLabel]);
  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border/50" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} interval="preserveStartEnd" />
      <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={40} />
      <ChartTooltip
        cursor={{ stroke: "var(--tretu-accent)", strokeWidth: 1, strokeOpacity: 0.35 }}
        content={<ChartTooltipContent indicator="line" />}
      />
    </>
  );

  return (
    <div data-testid={testId}>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        {series.length === 1 ? (
          <AreaChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${series[0].key})`} stopOpacity={0.45} />
                <stop offset="100%" stopColor={`var(--color-${series[0].key})`} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {axes}
            <Area
              type="monotone"
              dataKey={series[0].key}
              stroke={`var(--color-${series[0].key})`}
              strokeWidth={2}
              fill={`url(#${gradient})`}
              dot={false}
              activeDot={{ r: 4, fill: `var(--color-${series[0].key})`, stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        ) : (
          <LineChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            {axes}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={`var(--color-${s.key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: `var(--color-${s.key})`, stroke: "var(--background)", strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        )}
      </ChartContainer>
      <div data-chart={legendId}>
        <ChartStyle id={legendId} config={config} />
        <Legend series={series} />
      </div>
    </div>
  );
}
