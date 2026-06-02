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

const medalStyles: Record<number, string> = {
  1: "order-2 md:order-2 md:-mt-4 md:scale-105 border-[var(--tretu-accent)]/50 bg-gradient-to-b from-[var(--tretu-accent)]/15 to-card",
  2: "order-1 md:order-1 md:mt-6",
  3: "order-3 md:order-3 md:mt-8",
};

const rankLabels: Record<number, string> = {
  1: "#1",
  2: "#2",
  3: "#3",
};

export function RankingPodium({ entries }: { entries: Entry[] }) {
  const ordered = [...entries].sort((a, b) => {
    const order = [2, 1, 3];
    return order.indexOf(a.rank) - order.indexOf(b.rank);
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
      {ordered.map((entry) => (
        <article
          key={entry.rank}
          className={cn(
            "flex flex-col items-center rounded-2xl border border-border/70 bg-card/90 p-6 text-center shadow-sm",
            medalStyles[entry.rank]
          )}
        >
          <span
            className={cn(
              "mb-3 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold",
              entry.rank === 1
                ? "bg-[var(--tretu-accent)] text-white"
                : "bg-muted text-foreground"
            )}
          >
            {rankLabels[entry.rank]}
          </span>
          <h3 className="max-w-full truncate text-lg font-semibold" title={entry.nickname}>
            {entry.nickname}
          </h3>
          <RankDisplay
            prestige={entry.prestige}
            level={entry.level}
            levelTierName={entry.levelTierName}
            size={entry.rank === 1 ? "lg" : "md"}
            className="mt-3 justify-center"
          />
          <p className="mt-3 text-sm font-medium text-[var(--tretu-accent)]">
            {formatDurationGerman(entry.onlineSeconds)}
          </p>
          {entry.isOnline && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-current" />
              Online
            </span>
          )}
        </article>
      ))}
    </div>
  );
}
