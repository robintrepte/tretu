import { ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { DailyChart } from "@/components/admin/charts";
import { Kpi, PageHeader, Pill } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { appName, ECOSYSTEM_APPS } from "@/lib/admin/apps";
import { adminFormat } from "@/lib/admin/format";
import { ACTOR_ERRORS } from "@/lib/admin/auth-admin";
import { accountKpis, platformKpis, type PlatformKpis } from "@/lib/admin/overview";
import { getServiceStatuses, type ServiceState } from "@/lib/admin/service-status";
import { walletOverview } from "@/lib/admin/wallet-admin";
import { getAuthIssuer } from "@/lib/platform/env";

export const dynamic = "force-dynamic";

const STATE_TONE: Record<ServiceState, "success" | "warning" | "danger" | "neutral"> = {
  up: "success",
  degraded: "warning",
  down: "danger",
  unknown: "neutral",
};

export default async function AdminOverviewPage() {
  const actor = await requireAccountAdminPage();
  const [t, f, accounts, platform, wallet, status] = await Promise.all([
    getTranslations("admin"),
    adminFormat(),
    accountKpis(actor.sub),
    platformKpis().catch(() => null as PlatformKpis | null),
    walletOverview().catch(() => null),
    getServiceStatuses(),
  ]);

  // "Mein Konto" at auth.tretu.de, where two-factor sign-in is turned on.
  const issuer = getAuthIssuer();
  const accountUrl = issuer ? `${issuer}/konto?tab=sicherheit` : null;

  const authDays = accounts.ok
    ? (() => {
        const signIns = new Map(accounts.stats.signInsPerDay.map((d) => [d.day.slice(0, 10), d.count]));
        const days = new Set([...accounts.stats.signUpsPerDay.map((d) => d.day.slice(0, 10)), ...signIns.keys()]);
        const signUps = new Map(accounts.stats.signUpsPerDay.map((d) => [d.day.slice(0, 10), d.count]));
        return [...days].sort().map((day) => ({ day, signUps: signUps.get(day) ?? 0, signIns: signIns.get(day) ?? 0 }));
      })()
    : [];

  const appSeries = platform?.apps.slice(0, 4) ?? [];
  const appDays = appSeries.length
    ? appSeries[0].daily.map((d, i) => ({ day: d.day, ...Object.fromEntries(appSeries.map((a) => [a.app.replace(/[^a-z0-9]/g, ""), a.daily[i]?.users ?? 0])) }))
    : [];

  return (
    <section className="space-y-6">
      <PageHeader title={t("overview.title")} intro={t("overview.intro")} />

      {!accounts.ok && ACTOR_ERRORS.has(accounts.error) ? (
        // Checked up front: auth only lets admins with two-factor sign-in use the account admin.
        <div role="alert" className="flex gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" data-testid="admin-actor-blocked">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">{t(`errors.auth.${accounts.error}`)}</p>
            <p className="text-muted-foreground">{t(`overview.actorBlocked.${accounts.error}`)}</p>
            {accountUrl ? (
              <a href={accountUrl} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline" data-testid="admin-account-link">
                {t("overview.actorBlocked.openAccount")} <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <Panel title={t("overview.accountsTitle")}>
        {accounts.ok ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="kpi-accounts">
            <Kpi label={t("overview.kpi.total")} value={f.number(accounts.stats.users.total)} testId="kpi-total" />
            <Kpi label={t("overview.kpi.verified")} value={f.number(accounts.stats.users.verified)} />
            <Kpi label={t("overview.kpi.twoFactor")} value={f.number(accounts.stats.users.withTwoFactor)} />
            <Kpi label={t("overview.kpi.locked")} value={f.number(accounts.stats.users.locked)} />
            <Kpi label={t("overview.kpi.admins")} value={f.number(accounts.stats.users.admins)} />
          </div>
        ) : ACTOR_ERRORS.has(accounts.error) ? null : (
          <Hint tone="warning">
            {t("overview.authUnavailable")} {t(`errors.auth.${accounts.error}`)}
          </Hint>
        )}
        {platform || wallet ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {platform ? <Kpi label={t("overview.kpi.directory")} value={f.number(platform.directoryUsers)} /> : null}
            {wallet ? <Kpi label={t("overview.kpi.balance")} value={t("common.credits", { amount: f.number(wallet.totalBalance) })} /> : null}
            {platform ? <Kpi label={t("overview.kpi.badges")} value={f.number(platform.badgesTotal)} /> : null}
          </div>
        ) : null}
      </Panel>

      {accounts.ok ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Panel title={t("overview.signUpsTitle")} description={t("overview.signUpsDescription")}>
            <DailyChart
              data={authDays}
              series={[
                { key: "signUps", label: t("overview.signUps") },
                { key: "signIns", label: t("overview.signIns") },
              ]}
              testId="chart-signups"
            />
          </Panel>
          <Panel title={t("overview.providersTitle")}>
            <ul className="divide-y divide-border/60 text-sm">
              {Object.entries(accounts.stats.providers).map(([provider, count]) => (
                <li key={provider} className="flex items-center justify-between py-2">
                  <span>{t.has(`account.providerNames.${provider}`) ? t(`account.providerNames.${provider}`) : provider}</span>
                  <span className="tabular-nums text-muted-foreground">{f.number(count)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {platform ? (
        <>
          <Panel title={t("overview.appsTitle")} description={t("overview.appsDescription")}>
            <DailyChart
              data={appDays}
              series={appSeries.map((a) => ({ key: a.app.replace(/[^a-z0-9]/g, ""), label: appName(a.app) }))}
              testId="chart-apps"
            />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">{t("overview.appTable.app")}</th>
                    <th className="py-2 text-right font-medium">{t("overview.appTable.online")}</th>
                    <th className="py-2 text-right font-medium">{t("overview.appTable.weekly")}</th>
                    <th className="py-2 text-right font-medium">{t("overview.appTable.total")}</th>
                    <th className="py-2 pl-4 font-medium">{t("overview.appTable.admin")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {platform.apps.map((a) => {
                    const app = ECOSYSTEM_APPS.find((e) => e.id === a.app);
                    return (
                      <tr key={a.app}>
                        <td className="py-2 font-medium">{appName(a.app)}</td>
                        <td className="py-2 text-right tabular-nums">{f.number(a.onlineNow)}</td>
                        <td className="py-2 text-right tabular-nums">{f.number(a.weekly)}</td>
                        <td className="py-2 text-right tabular-nums">{f.number(a.total)}</td>
                        <td className="py-2 pl-4">
                          {app?.adminUrl ? (
                            <a href={app.adminUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                              {app.adminUrl.replace("https://", "")} <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{t("overview.noAdmin")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={t("overview.creditsTitle")} description={t("overview.creditsDescription")}>
              <DailyChart
                data={platform.credits}
                series={[
                  { key: "issued", label: t("overview.issued") },
                  { key: "spent", label: t("overview.spent") },
                  { key: "bought", label: t("overview.bought") },
                ]}
                testId="chart-credits"
              />
            </Panel>
            <Panel title={t("overview.badgesTitle")} description={t("overview.badgesDescription")}>
              <DailyChart data={platform.badgesPerDay} series={[{ key: "count", label: t("overview.badgesSeries") }]} testId="chart-badges" />
            </Panel>
          </div>
        </>
      ) : (
        <Hint tone="warning">{t("overview.platformUnavailable")}</Hint>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={t("overview.statusTitle")}
          actions={
            <Link href="/status" className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {t("overview.statusPage")} →
            </Link>
          }
        >
          {status.available && status.services.length ? (
            <>
              {status.stale ? (
                <Hint tone="warning">{status.updatedAt ? t("overview.statusStale", { date: f.dateTime(status.updatedAt) }) : t("overview.statusNoChecks")}</Hint>
              ) : null}
              <ul className="divide-y divide-border/60 text-sm" data-testid="service-status">
                {status.services.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2" data-testid={`service-${s.id}`}>
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="flex items-center gap-2">
                      {s.detail ? <span className="text-xs tabular-nums text-muted-foreground">{s.detail}</span> : null}
                      {s.checkedAt ? <span className="hidden text-xs text-muted-foreground sm:inline">{f.dateTime(s.checkedAt)}</span> : null}
                      <Pill tone={STATE_TONE[s.state]}>{t(`overview.statusStates.${s.state}`)}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Hint>{status.available ? t("overview.statusNoTargets") : t("overview.statusUnavailable")}</Hint>
          )}
        </Panel>
        <Panel title={t("overview.linksTitle")} description={t("overview.linksDescription")}>
          <ul className="divide-y divide-border/60 text-sm" data-testid="app-admin-links">
            {ECOSYSTEM_APPS.map((app) => (
              <li key={app.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium">{app.name}</span>
                {app.adminUrl ? (
                  <a href={app.adminUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    {app.adminUrl.replace("https://", "")} <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{t("overview.noAdmin")}</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}
