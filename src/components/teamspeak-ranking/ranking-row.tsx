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

export function RankingRow({ entry }: { entry: Entry }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-sm",
        "transition-colors hover:border-border dark:bg-card/50"
      )}
    >
      <span className="w-8 shrink-0 text-center font-mono text-sm font-semibold text-muted-foreground">
        {entry.rank}
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
      <div className="flex items-center gap-2">
        {entry.isOnline && (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
            title="Online"
          />
        )}
        <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--tretu-accent)]">
          {formatDurationGerman(entry.onlineSeconds)}
        </span>
      </div>
    </li>
  );
}
