import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { resyncBadgesAction } from "@/app/(internal)/dashboard/admin/actions";
import { ReasonDialog } from "@/components/admin/reason-dialog";
import { AccountLink, Empty, PageHeader, Pill } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { SUB_PATTERN } from "@/lib/admin/accounts";
import { badgeCatalog, syncStatus, type SyncOverview } from "@/lib/admin/badges-admin";
import { adminFormat } from "@/lib/admin/format";
import { getBadge } from "@/lib/platform/badges";
import { platformDb } from "@/lib/platform/db";
import { getDirectoryUser } from "@/lib/platform/directory";

export const dynamic = "force-dynamic";

export default async function BadgesAdminPage({ searchParams }: { searchParams: Promise<{ sub?: string }> }) {
  await requireAccountAdminPage();
  const subParam = (await searchParams).sub?.trim() ?? "";
  const sub = SUB_PATTERN.test(subParam) ? subParam : null;
  const [t, f] = await Promise.all([getTranslations("admin"), adminFormat()]);
  const [catalog, sync, user] = await Promise.all([
    badgeCatalog().catch(() => null),
    sub ? syncStatus(platformDb, sub).catch(() => null as SyncOverview | null) : Promise.resolve(null),
    sub ? getDirectoryUser(platformDb, sub).catch(() => null) : Promise.resolve(null),
  ]);
  if (!catalog) return <Hint tone="warning">{t("errors.platform_unavailable")}</Hint>;

  return (
    <section className="space-y-6">
      <PageHeader title={t("badges.title")} intro={t("badges.intro")} />

      <Panel title={t("badges.syncTitle")}>
        <form method="get" className="flex max-w-xl flex-wrap gap-2">
          <label htmlFor="sync-sub" className="sr-only">
            {t("common.tretuId")}
          </label>
          <Input id="sync-sub" name="sub" defaultValue={subParam} placeholder={t("wallet.lookupPlaceholder")} className="h-9 flex-1 rounded-xl" autoComplete="off" />
          <Button type="submit" variant="outline" size="sm" className="h-9 rounded-xl">
            {t("wallet.open")}
          </Button>
        </form>
        {sub && sync ? (
          <div className="mt-4 space-y-3" data-testid="sync-status">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AccountLink sub={sub} name={user?.name || user?.username || sub} secondary={user?.username ? `@${user.username}` : null} />
              <div className="flex items-center gap-2">
                {!sync.discordEnabled && !sync.teamspeakEnabled ? <Pill>{t("badges.syncOff")}</Pill> : null}
                <ReasonDialog action={resyncBadgesAction} hidden={{ sub }} trigger={<><RefreshCw /> {t("badges.resync")}</>} testId="action-resync" title={t("badges.resyncTitle")} description={t("badges.resyncDescription")} confirmLabel={t("badges.resync")} />
              </div>
            </div>
            {sync.rows.length === 0 ? (
              <Empty>{t("badges.noSync")}</Empty>
            ) : (
              <ul className="divide-y divide-border/60 text-sm">
                {sync.rows.map((r) => (
                  <li key={`${r.badgeKey}:${r.target}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{getBadge(r.badgeKey)?.title[f.locale] ?? r.badgeKey}</span>
                      <span className="text-xs text-muted-foreground"> · {r.target === "discord" ? t("badges.syncDiscord") : t("badges.syncTeamspeak")}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.detail ? <span>{r.detail}</span> : null}
                      <span>{f.dateTime(r.updatedAt)}</span>
                      <Pill tone={r.status === "done" ? "success" : "neutral"}>{t(`badges.syncStatus.${r.status === "done" ? "done" : "skipped"}`)}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {sync.pendingJobs.length ? (
              <p className="text-xs text-muted-foreground">
                {t("badges.pendingJobs", { count: sync.pendingJobs.length })}
                {sync.pendingJobs.some((j) => j.lastError) ? ` · ${sync.pendingJobs.find((j) => j.lastError)?.lastError}` : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-testid="badge-catalog">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t("badges.columns.badge")}</th>
                <th className="py-2 text-right font-medium">{t("badges.columns.holders")}</th>
                <th className="py-2 pl-4 font-medium">{t("badges.columns.rewards")}</th>
                <th className="py-2 font-medium">{t("badges.columns.sync")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {catalog.map((b) => (
                <tr key={b.key} data-testid={`catalog-${b.key}`}>
                  <td className="py-2 pr-3">
                    <Link href={`/dashboard/admin/abzeichen/${encodeURIComponent(b.key)}`} className="font-medium underline-offset-2 hover:underline">
                      {b.title[f.locale]}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{b.description[f.locale]}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums" data-testid={`holders-${b.key}`}>
                    {f.number(b.holders)}
                  </td>
                  <td className="py-2 pl-4 text-muted-foreground">{t("badges.rewards", { xp: b.xp, credits: b.credits })}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {b.discordRole ? t("badges.discordRole", { role: b.discordRole }) : null}
                    {b.discordRole && b.teamspeakGroup ? " · " : null}
                    {b.teamspeakGroup ? t("badges.teamspeakGroup", { group: b.teamspeakGroup }) : null}
                    {!b.discordRole && !b.teamspeakGroup ? t("badges.notMapped") : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}
