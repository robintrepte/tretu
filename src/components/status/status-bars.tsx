import type { Bucket } from "@/lib/status/read";
import { cn } from "@/lib/utils";

/** Colour of one bar: green = every check fine, amber = some problems, red = down for at least a quarter. */
export function bucketTone(bucket: Bucket): "none" | "up" | "degraded" | "down" {
  if (!bucket.checks) return "none";
  if (bucket.down / bucket.checks >= 0.25) return "down";
  if (bucket.down || bucket.degraded) return "degraded";
  return "up";
}

export const BAR_CLASSES = {
  none: "bg-muted-foreground/15",
  up: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
} as const;

/** One row of uptime bars (24 hours or 90 days), oldest left. Each bar has its summary as a tooltip. */
export function StatusBars({
  label,
  summary,
  buckets,
  titles,
  startLabel,
  endLabel,
  testId,
}: {
  label: string;
  /** e.g. "99,95 % verfügbar" or "keine Daten". */
  summary: string;
  buckets: Bucket[];
  /** Tooltip per bucket (same order). */
  titles: string[];
  startLabel: string;
  endLabel: string;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{label}</span>
        <span className="tabular-nums">{summary}</span>
      </div>
      <div className="flex h-8 items-stretch gap-px sm:gap-0.5" role="img" aria-label={`${label}: ${summary}`}>
        {buckets.map((bucket, i) => {
          const tone = bucketTone(bucket);
          return (
            <span
              key={bucket.start}
              title={titles[i]}
              data-tone={tone}
              className={cn("min-w-0 flex-1 rounded-[2px] transition-opacity hover:opacity-70", BAR_CLASSES[tone])}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
