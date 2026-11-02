import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AccountLink, Empty, inputClass, PageHeader, Pill } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { ADMIN_ACTIONS, listAdminAudit, type AuditFilters } from "@/lib/admin/audit";
import { actionMessageKey, adminFormat } from "@/lib/admin/format";
import { platformDb } from "@/lib/platform/db";

export const dynamic = "force-dynamic";

type Search = { actor?: string; target?: string; action?: string; from?: string; to?: string; before?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DETAIL_SKIP = new Set(["reason", "outcome", "error", "changed"]);

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAccountAdminPage();
  const s = await searchParams;
  const filters: AuditFilters = {
    actor: s.actor?.trim().slice(0, 128) || null,
    target: s.target?.trim().slice(0, 128) || null,
    action: s.action && (ADMIN_ACTIONS as readonly string[]).includes(s.action) ? s.action : null,
    from: s.from && DAY.test(s.from) ? s.from : null,
    to: s.to && DAY.test(s.to) ? s.to : null,
    before: s.before && /^\d{1,18}$/.test(s.before) ? Number(s.before) : null,
    limit: 50,
  };
  const [t, f, result] = await Promise.all([getTranslations("admin"), adminFormat(), listAdminAudit(platformDb, filters).catch(() => null)]);
  const actionLabel = (action: string) =>
    t.has(`audit.actions.${actionMessageKey(action)}`) ? t(`audit.actions.${actionMessageKey(action)}`) : action;
  const query = (extra: Record<string, string>) =>
    new URLSearchParams(
      Object.fromEntries(
        Object.entries({ actor: filters.actor, target: filters.target, action: filters.action, from: filters.from, to: filters.to, ...extra }).filter(
          (e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0
        )
      )
    ).toString();

  return (
    <section className="space-y-6">
      <PageHeader title={t("audit.title")} intro={t("audit.intro")} />
      <form method="get" className="grid gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 sm:grid-cols-2 lg:grid-cols-6" data-testid="audit-filters">
        <label className="space-y-1 text-xs text-muted-foreground lg:col-span-2">
          {t("audit.filters.actor")}
          <input name="actor" defaultValue={filters.actor ?? ""} className={inputClass} autoComplete="off" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground lg:col-span-2">
          {t("audit.filters.target")}
          <input name="target" defaultValue={filters.target ?? ""} className={inputClass} autoComplete="off" data-testid="audit-filter-target" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground lg:col-span-2">
          {t("audit.filters.action")}
          <select name="action" defaultValue={filters.action ?? ""} className={inputClass} data-testid="audit-filter-action">
            <option value="">{t("audit.filters.allActions")}</option>
            {ADMIN_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground lg:col-span-2">
          {t("audit.filters.from")}
          <input type="date" name="from" defaultValue={filters.from ?? ""} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground lg:col-span-2">
          {t("audit.filters.to")}
          <input type="date" name="to" defaultValue={filters.to ?? ""} className={inputClass} />
        </label>
        <div className="flex items-end gap-2 lg:col-span-2">
          <Button type="submit" size="sm" className="h-9 rounded-xl bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
            {t("common.apply")}
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 rounded-xl">
            <Link href="/dashboard/admin/protokoll">{t("common.reset")}</Link>
          </Button>
        </div>
      </form>

      {!result ? (
        <Hint tone="warning">{t("errors.platform_unavailable")}</Hint>
      ) : (
        <Panel>
          {result.items.length === 0 ? (
            <Empty>{t("audit.empty")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm" data-testid="audit-table">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">{t("audit.columns.date")}</th>
                    <th className="py-2 font-medium">{t("audit.columns.actor")}</th>
                    <th className="py-2 font-medium">{t("audit.columns.action")}</th>
                    <th className="py-2 font-medium">{t("audit.columns.target")}</th>
                    <th className="py-2 font-medium">{t("audit.columns.details")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {result.items.map((e) => {
                    const extra = Object.entries(e.details).filter(([k, v]) => !DETAIL_SKIP.has(k) && v !== null && v !== undefined);
                    return (
                      <tr key={e.id} data-testid="audit-row" className="align-top">
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-foreground">{f.dateTime(e.createdAt)}</td>
                        <td className="max-w-[12rem] py-2 pr-3">
                          <AccountLink sub={e.actorSub} name={e.actorName} />
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-medium">{actionLabel(e.action)}</span>
                          {e.details.outcome === "failed" ? (
                            <span className="mt-1 block">
                              <Pill tone="danger">{t("audit.failed", { error: String(e.details.error ?? "?") })}</Pill>
                            </span>
                          ) : e.details.outcome === "noop" ? (
                            <span className="mt-1 block">
                              <Pill>{t("audit.noop")}</Pill>
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[12rem] py-2 pr-3">{e.targetSub ? <AccountLink sub={e.targetSub} name={e.targetName} /> : t("common.none")}</td>
                        <td className="max-w-[22rem] py-2 text-xs text-muted-foreground">
                          {typeof e.details.reason === "string" ? <p className="text-foreground">{t("audit.reason", { reason: e.details.reason })}</p> : null}
                          {extra.length ? (
                            <p className="mt-0.5 break-words font-mono">
                              {extra.map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {result.nextBefore ? (
            <Link href={`/dashboard/admin/protokoll?${query({ before: String(result.nextBefore) })}`} className="mt-4 inline-block text-sm underline-offset-2 hover:underline">
              {t("audit.older")} →
            </Link>
          ) : null}
        </Panel>
      )}
    </section>
  );
}
