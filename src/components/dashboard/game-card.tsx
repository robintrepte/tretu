import { ChevronRight, Globe, Users } from "lucide-react";
import Link from "next/link";

import { GameThumbnail } from "@/components/dashboard/game-thumbnail";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { getGameArt } from "@/lib/games/art";
import { cn } from "@/lib/utils";

export type GameCardData = {
  id: number;
  name: string;
  gameType: string;
  status: "running" | "offline" | "provisioning" | "deleting" | "error";
  playerCount: number | null;
  ip: string | null;
};

export function GameCard({ game }: { game: GameCardData }) {
  const { label: gameLabel } = getGameArt(game.gameType);
  const href = `/dashboard/games/${game.id}`;

  return (
    <Link
      href={href}
      className={cn(
        "group block overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm outline-none",
        "transition-shadow duration-200 hover:border-[var(--tretu-accent)]/25 hover:shadow-md",
        "focus-visible:ring-2 focus-visible:ring-[var(--tretu-accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      <article>
        <GameThumbnail gameType={game.gameType} size="md" />
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold tracking-tight">{game.name}</h3>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">{gameLabel}</p>
            </div>
            <StatusBadge status={game.status} />
          </div>

          <div className="mt-4 grid gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground dark:bg-muted/25">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span>
                <span className="text-foreground/80">Spieler:innen</span>{" "}
                <span className="tabular-nums font-medium text-foreground">{game.playerCount ?? "–"}</span>
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2.5">
              <Globe className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span className="truncate font-mono text-xs text-foreground/90">{game.ip ?? "noch keine IP"}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm font-medium text-muted-foreground transition-colors group-hover:text-[var(--tretu-accent)]">
            <span>Details &amp; Aktionen</span>
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </div>
      </article>
    </Link>
  );
}
