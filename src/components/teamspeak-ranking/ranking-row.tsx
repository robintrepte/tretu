import { RankDisplay } from "@/components/teamspeak-ranking/rank-display";
import { formatDurationGerman } from "@/lib/teamspeak/format-duration";
import { cn } from "@/lib/utils";

type Entry = {
  rank: number;
  nickname: string;
  onlineSeconds: number;
  prestige: number;
  level: number;
  levelTierName?: string | null;
  isOnline: boolean;
};

export function RankingRow({
  entry,
  emphasized = false,
}: {
  entry: Entry;
  emphasized?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-sm",
        "transition-colors hover:border-border dark:bg-card/50",
        emphasized && "border-[var(--tretu-accent)]/40"
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center font-bold tabular-nums",
          emphasized
            ? "h-12 min-w-12 rounded-full bg-[var(--tretu-accent)] px-2 text-lg text-white"
            : "w-8 text-center font-mono text-sm text-muted-foreground"
        )}
      >
        {emphasized ? `#${entry.rank}` : entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={entry.nickname}>
          {entry.nickname}
        </p>
        <RankDisplay
          prestige={entry.prestige}
          level={entry.level}
          levelTierName={entry.levelTierName}
          size="sm"
          className="mt-1"
        />
      </div>
      <div className="flex items-center gap-3">
        {entry.isOnline && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
            Online
          </span>
        )}
        <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--tretu-accent)]">
          {formatDurationGerman(entry.onlineSeconds)}
        </span>
      </div>
    </li>
  );
}
