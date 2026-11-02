import { Check, ExternalLink, Gamepad2, Lock, Settings, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/metadata";
import { platformDb } from "@/lib/platform/db";
import { displayName } from "@/lib/platform/directory";
import { getAuthIssuer } from "@/lib/platform/env";
import { accountUrl, formatDate } from "@/lib/platform/format";
import { getTranslations } from "@/lib/platform/i18n";
import { findProfileUser, getVisibility, loadProfilePage, type LinkedAccounts } from "@/lib/platform/profile";

import { AddFriendButton } from "../../_components/add-friend-button";
import { Avatar } from "../../_components/avatar";
import { PlatformIcon } from "../../_components/badge-icon";
import { LevelBar } from "../../_components/level-bar";
import { getPageContext, loadSafely } from "../../_components/page-context";
import { PlatformPage, SectionCard, Unavailable } from "../../_components/platform-page";
import { buildStatCards, StatCards } from "../../_components/stat-cards";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const { t } = await getTranslations();
  const user = await loadSafely(() => findProfileUser(platformDb, username));
  const name = user ? displayName(user) : decodeURIComponent(username);
  const visibility = user ? await loadSafely(() => getVisibility(platformDb, user.sub)) : null;
  return pageMetadata({
    title: t("profile.metaTitle", { name }),
    description: t("profile.metaDescription", { name }),
    path: `/u/${encodeURIComponent(user?.username ?? username)}`,
    noIndex: visibility !== "public",
  });
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const ctx = await getPageContext();
  const { t, locale } = ctx;
  if (!ctx.available) {
    return (
      <PlatformPage ctx={ctx} title={t("nav.profile")} icon={UserRound}>
        <Unavailable ctx={ctx} />
      </PlatformPage>
    );
  }
  const page = await loadSafely(() => loadProfilePage(platformDb, username, ctx.user?.sub ?? null, locale));
  if (!page) {
    return (
      <PlatformPage ctx={ctx} title={t("nav.profile")} icon={UserRound}>
        <Unavailable ctx={ctx} />
      </PlatformPage>
    );
  }
  if (page.state === "not_found") notFound();
  const name = displayName(page.user);
  if (page.state === "restricted") {
    return (
      <PlatformPage ctx={ctx} title={name} icon={UserRound}>
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
          <Avatar name={name} src={page.user.picture} size="lg" />
          <Lock className="size-6 text-muted-foreground" aria-hidden />
          <h2 className="text-xl font-semibold">{t("profile.restrictedTitle")}</h2>
          <p className="max-w-md text-muted-foreground">
            {page.visibility === "friends" ? t("profile.restrictedFriends", { name }) : t("profile.restrictedPrivate", { name })}
          </p>
          {ctx.user && page.visibility === "friends" && page.user.username ? <AddFriendButton username={page.user.username} /> : null}
        </section>
      </PlatformPage>
    );
  }

  const cards = buildStatCards(page.stats, t, locale);
  const canAdd = Boolean(ctx.user && !page.isOwner && !page.isFriend && page.user.username);
  return (
    <PlatformPage ctx={ctx} title={name} icon={UserRound} wide>
      <section className="flex flex-col gap-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm md:flex-row md:items-center md:p-8">
        <Avatar name={name} src={page.user.picture} size="lg" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="truncate text-2xl font-semibold md:text-3xl">{name}</h2>
              <span className="inline-flex items-center rounded-full bg-[var(--tretu-accent)] px-3 py-0.5 text-sm font-semibold text-white">
                {t("common.level", { level: page.level.level })}
              </span>
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {page.user.username ? <span>@{page.user.username}</span> : null}
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" aria-hidden />
                {t("profile.friendsCount", { count: page.friends })}
              </span>
              <span>{t("profile.badgesCount", { count: page.badges.length })}</span>
              {page.isOwner ? <span>{t("profile.visibility", { visibility: page.visibility })}</span> : null}
            </p>
          </div>
          <LevelBar level={page.level} t={t} />
          <LinkedAccountsRow linked={page.linked} name={name} isOwner={page.isOwner} t={t} />
        </div>
        <div className="flex shrink-0 gap-2">
          {page.isOwner ? (
            <Button asChild variant="outline">
              <Link href="/einstellungen">
                <Settings aria-hidden />
                {t("profile.editSettings")}
              </Link>
            </Button>
          ) : null}
          {canAdd ? <AddFriendButton username={page.user.username as string} /> : null}
          {page.isFriend ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-700 dark:text-emerald-300">
              {t("profile.friendBadge")}
            </span>
          ) : null}
        </div>
      </section>

      <SectionCard title={t("profile.badgesTitle")}>
        {page.badges.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {page.badges.map((badge) => (
              <li
                key={badge.key}
                className="flex flex-col items-center gap-2 rounded-xl border border-border/70 bg-background/60 p-4 text-center"
                title={badge.description}
              >
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--tretu-accent)]/15 text-[var(--tretu-accent)]">
                  <PlatformIcon name={badge.icon} className="size-6" />
                </span>
                <span className="text-sm font-semibold leading-tight">{badge.title}</span>
                <span className="text-xs text-muted-foreground">{t("profile.earnedOn", { date: formatDate(locale, badge.earnedAt) })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("profile.noBadges")}</p>
        )}
      </SectionCard>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("profile.statsTitle")}</h2>
        {cards.length ? <StatCards cards={cards} /> : <p className="text-muted-foreground">{t("profile.noStats")}</p>}
      </section>
    </PlatformPage>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>["t"];

const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-0.5 text-sm font-medium text-foreground";

/** Discord / Minecraft / Steam / TeamSpeak linked to the Tretu-Konto (only rendered where the profile may be seen). */
function LinkedAccountsRow({ linked, name, isOwner, t }: { linked: LinkedAccounts; name: string; isOwner: boolean; t: T }) {
  const items: ReactNode[] = [];
  if (linked.discord) {
    items.push(
      <li key="discord" className={chip} data-testid="profile-linked-discord">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Discord
      </li>
    );
  }
  if (linked.minecraft) {
    items.push(
      <li key="minecraft" className={chip} data-testid="profile-linked-minecraft">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        {linked.minecraftName ? t("profile.minecraftAs", { name: linked.minecraftName }) : "Minecraft"}
      </li>
    );
  }
  if (linked.steamUrl) {
    items.push(
      <li key="steam">
        <a
          href={linked.steamUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={t("profile.steamTitle", { name })}
          data-testid="profile-steam"
          className={`${chip} transition-colors hover:border-[var(--tretu-accent)] hover:text-[var(--tretu-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tretu-accent)]`}
        >
          <Gamepad2 className="size-4" aria-hidden />
          {t("profile.steam")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </li>
    );
  }
  if (linked.teamspeak) {
    items.push(
      <li key="teamspeak" className={chip} data-testid="profile-linked-teamspeak">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        TeamSpeak
      </li>
    );
  }
  const connectSteam = isOwner && !linked.steamUrl && getAuthIssuer();
  if (!items.length && !connectSteam) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("profile.linkedTitle")}</p>
      <ul className="flex flex-wrap items-center gap-2" aria-label={t("profile.linkedTitle")}>
        {items}
        {connectSteam ? (
          <li>
            <a
              href={accountUrl()}
              data-testid="profile-connect-steam"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-[var(--tretu-accent)] hover:underline"
            >
              <Gamepad2 className="size-4" aria-hidden />
              {t("profile.connectSteam")}
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
