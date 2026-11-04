import { BookOpen, Box, Building2, Gamepad2, Leaf, type LucideIcon } from "lucide-react";

import { formatNumber } from "@/lib/platform/format";
import type { PlatformLocale, Translator } from "@/lib/platform/i18n-core";

type StatCard = { key: string; title: string; icon: LucideIcon; items: { label: string; value: string }[] };

function prettyGame(id: string): string {
  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildStatCards(stats: Record<string, number>, t: Translator, locale: PlatformLocale): StatCard[] {
  const n = (key: string) => stats[key] ?? 0;
  const fmt = (v: number) => formatNumber(locale, v);
  const cards: StatCard[] = [];

  if (n("play.games.played") > 0) {
    const played = n("play.games.played");
    const won = n("play.games.won");
    const favorite = Object.entries(stats)
      .filter(([k]) => /^play\.[^.]+\.played$/.test(k) && k !== "play.games.played")
      .sort((a, b) => b[1] - a[1])[0];
    cards.push({
      key: "play",
      title: t("apps.play"),
      icon: Gamepad2,
      items: [
        { label: t("profile.stats.play.games"), value: fmt(played) },
        { label: t("profile.stats.play.wins"), value: fmt(won) },
        { label: t("profile.stats.play.winRate"), value: `${fmt(Math.round((won / played) * 100))} %` },
        ...(favorite ? [{ label: t("profile.stats.play.favorite"), value: prettyGame(favorite[0].split(".")[1]) }] : []),
      ],
    });
  }
  if (n("saga.turns") + n("saga.worlds.created") + n("saga.characters.created") + n("saga.campaign.played") > 0) {
    cards.push({
      key: "saga",
      title: t("apps.saga"),
      icon: BookOpen,
      items: [
        { label: t("profile.stats.saga.turns"), value: fmt(n("saga.turns")) },
        { label: t("profile.stats.saga.campaigns"), value: fmt(n("saga.campaign.played")) },
        { label: t("profile.stats.saga.worlds"), value: fmt(n("saga.worlds.created")) },
        { label: t("profile.stats.saga.characters"), value: fmt(n("saga.characters.created")) },
      ],
    });
  }
  if (n("hollowmere.creatures.befriended") + n("hollowmere.days.played") + n("hollowmere.games.played") > 0) {
    cards.push({
      key: "hollowmere",
      title: t("apps.hollowmere"),
      icon: Leaf,
      items: [
        { label: t("profile.stats.hollowmere.befriended"), value: fmt(n("hollowmere.creatures.befriended")) },
        { label: t("profile.stats.hollowmere.days"), value: fmt(n("hollowmere.days.played")) },
        { label: t("profile.stats.hollowmere.battles"), value: fmt(n("hollowmere.battle.played")) },
        { label: t("profile.stats.hollowmere.wins"), value: fmt(n("hollowmere.games.won")) },
      ],
    });
  }
  if (n("minecraft.playtime.minutes") > 0) {
    cards.push({
      key: "minecraft",
      title: t("apps.minecraft"),
      icon: Box,
      items: [
        {
          label: t("profile.stats.minecraft.playtime"),
          value: t("profile.stats.minecraft.hours", { hours: Math.floor(n("minecraft.playtime.minutes") / 60) }),
        },
      ],
    });
  }
  if (n("city.playtime.minutes") + n("city.coop.sessions") > 0) {
    cards.push({
      key: "city",
      title: t("apps.city"),
      icon: Building2,
      items: [
        { label: t("profile.stats.city.playtime"), value: t("profile.stats.city.hours", { hours: Math.floor(n("city.playtime.minutes") / 60) }) },
        { label: t("profile.stats.city.coop"), value: fmt(n("city.coop.sessions")) },
      ],
    });
  }
  return cards;
}

export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.key} className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Icon className="size-5 text-[var(--tretu-accent)]" aria-hidden />
              {card.title}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {card.items.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="truncate text-xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
                  <dd className="truncate text-xl font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
