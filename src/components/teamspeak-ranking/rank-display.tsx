import { Crown, Star } from "lucide-react";

import { MAX_LEVEL, MAX_PRESTIGE } from "@/lib/teamspeak/prestige-progress";
import { cn } from "@/lib/utils";

const prestigeBadgeClass: Record<number, string> = {
  1: "border-amber-500/45 bg-gradient-to-br from-amber-500/25 to-orange-600/10 text-amber-950 shadow-sm shadow-amber-500/10 dark:text-amber-100",
  2: "border-slate-400/50 bg-gradient-to-br from-slate-300/30 to-slate-500/15 text-slate-900 shadow-sm shadow-slate-400/10 dark:text-slate-100",
  3: "border-violet-400/55 bg-gradient-to-br from-violet-500/30 via-fuchsia-500/15 to-amber-400/20 text-violet-950 shadow-sm shadow-violet-500/15 dark:text-violet-50",
};

const starFilledClass: Record<number, string> = {
  1: "fill-amber-500 text-amber-500",
  2: "fill-slate-400 text-slate-400",
  3: "fill-violet-400 text-violet-400",
};

export type RankDisplayProps = {
  prestige: number;
  level: number;
  levelTierName?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function levelLabel(level: number, levelTierName?: string | null): string {
  if (levelTierName) return levelTierName;
  return level > 0 ? `Level ${level}` : "Level 0";
}

function isMaxRank(prestige: number, level: number): boolean {
  return prestige >= MAX_PRESTIGE && level >= MAX_LEVEL;
}

function PrestigeStars({
  prestige,
  size,
}: {
  prestige: number;
  size: "sm" | "md" | "lg";
}) {
  const iconClass = cn(
    size === "lg" ? "h-4 w-4" : size === "md" ? "h-3.5 w-3.5" : "h-3 w-3",
    starFilledClass[prestige] ?? starFilledClass[1]
  );

  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: prestige }, (_, i) => (
        <Star key={i} className={iconClass} strokeWidth={1.5} />
      ))}
    </span>
  );
}

function PrestigeBadge({
  prestige,
  size,
}: {
  prestige: number;
  size: "sm" | "md" | "lg";
}) {
  const p = Math.min(Math.max(prestige, 1), MAX_PRESTIGE);
  const textClass =
    size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[11px]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "lg" ? "px-3 py-1" : size === "md" ? "px-2.5 py-0.5" : "px-2 py-0.5",
        textClass,
        prestigeBadgeClass[p] ?? prestigeBadgeClass[1]
      )}
      title={`Prestige ${p}`}
    >
      <PrestigeStars prestige={p} size={size} />
      <span className="tabular-nums">P{p}</span>
    </span>
  );
}

function LevelBadge({
  level,
  levelTierName,
  prestige,
  size,
}: {
  level: number;
  levelTierName?: string | null;
  prestige: number;
  size: "sm" | "md" | "lg";
}) {
  const maxed = isMaxRank(prestige, level);
  const textClass =
    size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[11px]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "lg" ? "px-3 py-1" : size === "md" ? "px-2.5 py-0.5" : "px-2 py-0.5",
        textClass,
        maxed
          ? "border-[var(--tretu-accent)]/50 bg-[var(--tretu-accent)]/15 text-[var(--tretu-accent)] dark:text-orange-200"
          : "border-border/80 bg-muted/60 text-foreground"
      )}
      title={levelLabel(level, levelTierName)}
    >
      {maxed && (
        <Crown
          className={cn(
            "shrink-0 text-[var(--tretu-accent)]",
            size === "lg" ? "h-4 w-4" : "h-3 w-3"
          )}
          aria-hidden
        />
      )}
      <span className="truncate">{maxed ? "MAX" : levelLabel(level, levelTierName)}</span>
    </span>
  );
}

export function RankDisplay({
  prestige,
  level,
  levelTierName,
  size = "sm",
  className,
}: RankDisplayProps) {
  const p = Math.max(0, prestige);

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label={
        p > 0
          ? `Prestige ${p}, ${levelLabel(level, levelTierName)}`
          : levelLabel(level, levelTierName)
      }
    >
      {p > 0 && <PrestigeBadge prestige={p} size={size} />}
      <LevelBadge
        level={level}
        levelTierName={levelTierName}
        prestige={p}
        size={size}
      />
    </div>
  );
}
