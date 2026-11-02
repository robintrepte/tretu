import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { grantBadgeAction, revokeBadgeAction } from "@/app/(internal)/dashboard/admin/actions";
import { TextField } from "@/components/admin/fields";
import { ReasonDialog } from "@/components/admin/reason-dialog";
import { AccountLink, Empty, PageHeader, Pill } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { badgeHolders } from "@/lib/admin/badges-admin";
import { adminFormat } from "@/lib/admin/format";
import { getBadge } from "@/lib/platform/badges";
import { platformDb } from "@/lib/platform/db";

export const dynamic = "force-dynamic";

const PAGE = 100;

export default async function BadgeHoldersPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ page?: string }> }) {
  await requireAccountAdminPage();
  const key = decodeURIComponent((await params).key);
  const page = Math.max(0, Math.min(10_000, Number((await searchParams).page ?? 0) || 0));
  const [t, f] = await Promise.all([getTranslations("admin"), adminFormat()]);
  const badge = getBadge(key);
  if (!badge) return <Hint tone="danger">{t("errors.unknown_badge")}</Hint>;
  const holders = await badgeHolders(platformDb, key, { limit: PAGE, offset: page * PAGE }).catch(() => null);
  const title = badge.title[f.locale];

  return (
    <section className="space-y-6">
      <PageHeader
        title={t("badges.holdersTitle", { badge: title })}
        intro={`${badge.description[f.locale]} · ${t("badges.rewards", { xp: badge.xp, credits: badge.credits })}`}
        actions={
          <>
            <Link href="/dashboard/admin/abzeichen" className="text-sm text-muted-foreground hover:text-foreground">
              ← {t("common.back")}
            </Link>
            <ReasonDialog
              action={grantBadgeAction}
              hidden={{ badge: key }}
              trigger={<><Plus /> {t("badges.grant")}</>}
              triggerVariant="default"
              testId="action-grant-badge"
              title={t("badges.grantTitle", { badge: title })}
              description={t("badges.grantDescription")}
              confirmLabel={t("badges.grant")}
            >
              <TextField name="sub" label={t("badges.grantSub")} placeholder={t("wallet.lookupPlaceholder")} testId="grant-sub" />
            </ReasonDialog>
          </>
        }
      />
      {!holders ? (
        <Hint tone="warning">{t("errors.platform_unavailable")}</Hint>
      ) : (
        <Panel title={`${f.number(holders.total)} ${t("badges.columns.holders")}`}>
          {holders.items.length === 0 ? (
            <Empty>{t("badges.noHolders")}</Empty>
          ) : (
            <ul className="divide-y divide-border/60 text-sm" data-testid="badge-holders">
              {holders.items.map((h) => (
                <li key={h.sub} className="flex flex-wrap items-center justify-between gap-3 py-2" data-testid={`holder-${h.sub}`}>
                  <div className="min-w-0">
                    <AccountLink sub={h.sub} name={h.name || h.username} secondary={t("badges.earned", { date: f.dateTime(h.earnedAt) })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {h.sync.map((s) => (
                      <Pill key={s.target} tone={s.status === "done" ? "success" : "neutral"}>
                        {s.target === "discord" ? t("badges.syncDiscord") : t("badges.syncTeamspeak")}: {t(`badges.syncStatus.${s.status === "done" ? "done" : "skipped"}`)}
                      </Pill>
                    ))}
                    <ReasonDialog
                      action={revokeBadgeAction}
                      hidden={{ sub: h.sub, badge: key }}
                      trigger={t("badges.revoke")}
                      triggerSize="xs"
                      testId={`action-revoke-${h.sub}`}
                      title={t("badges.revokeTitle", { badge: title })}
                      description={t("badges.revokeDescription")}
                      confirmLabel={t("badges.revoke")}
                      destructive
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {holders.total > (page + 1) * PAGE ? (
            <Link href={`/dashboard/admin/abzeichen/${encodeURIComponent(key)}?page=${page + 1}`} className="mt-4 inline-block text-sm underline-offset-2 hover:underline">
              {t("common.more")} →
            </Link>
          ) : null}
        </Panel>
      )}
    </section>
  );
}
