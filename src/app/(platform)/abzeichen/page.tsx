import { Award, Check, Lock } from "lucide-react";
import type { Metadata } from "next";

import { pageMetadata } from "@/lib/metadata";
import { BADGES, badgeProgress, type BadgeCategory } from "@/lib/platform/badges";
import { platformDb } from "@/lib/platform/db";
import { formatDate } from "@/lib/platform/format";
import { getTranslations } from "@/lib/platform/i18n";
import { getEarnedBadges } from "@/lib/platform/profile";
import { getStats } from "@/lib/platform/progress";
import { loginUrl } from "@/lib/platform/current-user";
import { cn } from "@/lib/utils";

import { PlatformIcon } from "../_components/badge-icon";
import { getPageContext, loadSafely } from "../_components/page-context";
import { PlatformPage } from "../_components/platform-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return pageMetadata({ title: t("badges.metaTitle"), description: t("badges.intro"), path: "/abzeichen" });
}

const CATEGORIES: BadgeCategory[] = ["community", "play", "saga", "hollowmere", "minecraft"];

export default async function BadgesPage() {
  const ctx = await getPageContext();
  const { t, locale } = ctx;
  const progress =
    ctx.available && ctx.user
      ? await loadSafely(async () => ({
          stats: await getStats(platformDb, ctx.user!.sub),
          earned: new Map((await getEarnedBadges(platformDb, ctx.user!.sub, locale)).map((b) => [b.key, b.earnedAt])),
        }))
      : null;
  const accountCreatedAt = ctx.directory?.authCreatedAt ?? null;

  return (
    <PlatformPage ctx={ctx} title={t("badges.title")} icon={Award} intro={t("badges.intro")} wide>
      {progress ? (
        <p className="text-sm font-medium text-[var(--tretu-accent)]">
          {t("badges.earnedCount", { earned: progress.earned.size, total: BADGES.length })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          <a href={loginUrl("/abzeichen")} className="underline-offset-4 hover:text-[var(--tretu-accent)] hover:underline">
            {t("badges.loginHint")}
          </a>
        </p>
      )}
      {CATEGORIES.map((category) => {
        const badges = BADGES.filter((b) => b.category === category);
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-xl font-semibold">{t(`badges.categories.${category}`)}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((badge) => {
                const earnedAt = progress?.earned.get(badge.key);
                const state = progress ? badgeProgress(badge, { stats: progress.stats, accountCreatedAt }) : null;
                const pct = state ? Math.round((state.current / Math.max(1, state.target)) * 100) : 0;
                return (
                  <li
                    key={badge.key}
                    className={cn(
                      "flex gap-4 rounded-2xl border bg-card p-4 shadow-sm",
                      earnedAt ? "border-[var(--tretu-accent)]/50" : "border-border/70"
                    )}
                  >
                    <span
                      className={cn(
                        "relative inline-flex size-14 shrink-0 items-center justify-center rounded-full",
                        earnedAt ? "bg-[var(--tretu-accent)] text-white" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <PlatformIcon name={badge.icon} className="size-7" />
                      {progress && !earnedAt ? (
                        <Lock className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-card p-0.5 text-muted-foreground" aria-hidden />
                      ) : null}
                      {earnedAt ? (
                        <Check className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-emerald-500 p-0.5 text-white" aria-hidden />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="font-semibold leading-tight">{badge.title[locale]}</h3>
                      <p className="text-sm text-muted-foreground">{badge.description[locale]}</p>
                      <p className="text-xs font-medium text-[var(--tretu-accent)]">
                        {t("badges.reward", { xp: badge.xp, credits: badge.credits })}
                      </p>
                      {earnedAt ? (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          {t("badges.earned")} · {formatDate(locale, earnedAt)}
                        </p>
                      ) : state && state.target > 1 ? (
                        <div className="space-y-1 pt-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-[var(--tretu-accent)]" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {t("badges.progress", { current: state.current, target: state.target })}
                          </p>
                        </div>
                      ) : state ? (
                        <p className="text-xs text-muted-foreground">{t("badges.locked")}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </PlatformPage>
  );
}
