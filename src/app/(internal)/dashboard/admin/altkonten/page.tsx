import { getTranslations } from "next-intl/server";

import { MergeDialog } from "@/components/admin/merge-dialog";
import { AccountLink, Empty, PageHeader, Pill } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { authAdmin, AuthAdminError, type LegacyCandidate } from "@/lib/admin/auth-admin";
import { adminFormat } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

/** Unmerged old accounts (`GET /api/v1/admin/legacy`) with one-click merge preview into a possible match. */
export default async function LegacyAccountsPage() {
  const actor = await requireAccountAdminPage();
  const [t, f] = await Promise.all([getTranslations("admin"), adminFormat()]);
  let items: LegacyCandidate[] = [];
  let error: AuthAdminError["code"] | null = null;
  try {
    items = await authAdmin.legacy(actor.sub);
  } catch (e) {
    if (!(e instanceof AuthAdminError)) throw e;
    error = e.code;
  }

  return (
    <section className="space-y-6">
      <PageHeader title={t("legacy.title")} intro={t("legacy.intro")} />
      {error ? <Hint tone="danger">{t(`errors.auth.${error}`)}</Hint> : null}
      {!error && items.length === 0 ? <Empty>{t("legacy.empty")}</Empty> : null}
      <div className="space-y-4" data-testid="legacy-list">
        {items.map((c) => (
          <Panel key={c.sub}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <AccountLink sub={c.sub} name={c.username ? `@${c.username}` : c.sub} secondary={[c.email, f.date(c.createdAt), c.usedByApps ? t("legacy.usedByApps") : null].filter(Boolean).join(" · ")} />
                <div className="flex flex-wrap gap-1.5">
                  {c.legacy.map((l) => (
                    <Pill key={`${l.app}:${l.legacyUserId}`}>
                      {l.app}: {l.legacyUsername ?? l.legacyUserId}
                    </Pill>
                  ))}
                </div>
              </div>
              <MergeDialog from={c.sub} trigger={t("account.actions.merge")} testId={`legacy-merge-${c.sub}`} />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("legacy.matches")}</p>
              {c.possibleMatches.length === 0 ? (
                <Empty>{t("legacy.noMatches")}</Empty>
              ) : (
                <ul className="divide-y divide-border/60 text-sm">
                  {c.possibleMatches.map((m) => (
                    <li key={m.sub} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <AccountLink sub={m.sub} name={m.username ? `@${m.username}` : m.sub} secondary={m.email} />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.reasons.map((r) => (
                            <Pill key={r} tone="accent">
                              {t.has(`legacy.reasons.${r}`) ? t(`legacy.reasons.${r}`) : r}
                            </Pill>
                          ))}
                        </div>
                      </div>
                      <MergeDialog from={c.sub} into={m.sub} trigger={t("legacy.mergeInto", { name: m.username ?? m.sub })} testId={`legacy-merge-${c.sub}-${m.sub}`} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}
