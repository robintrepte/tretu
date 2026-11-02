import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DailyChart } from "@/components/admin/charts";
import { AccountLink, Empty, Kpi, PageHeader } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { SUB_PATTERN } from "@/lib/admin/accounts";
import { adminFormat } from "@/lib/admin/format";
import { walletOverview } from "@/lib/admin/wallet-admin";

export const dynamic = "force-dynamic";

export default async function WalletAdminPage({ searchParams }: { searchParams: Promise<{ sub?: string }> }) {
  await requireAccountAdminPage();
  const lookup = (await searchParams).sub?.trim();
  if (lookup && SUB_PATTERN.test(lookup)) redirect(`/dashboard/admin/wallet/${encodeURIComponent(lookup)}`);
  const [t, f, overview] = await Promise.all([getTranslations("admin"), adminFormat(), walletOverview().catch(() => null)]);
  const sum = (key: "issued" | "spent" | "bought") => overview?.days.reduce((acc, d) => acc + d[key], 0) ?? 0;

  return (
    <section className="space-y-6">
      <PageHeader title={t("wallet.title")} intro={t("wallet.intro")} />
      <form method="get" action="/dashboard/admin/wallet" className="flex max-w-xl flex-wrap gap-2">
        <label htmlFor="wallet-sub" className="sr-only">
          {t("wallet.lookup")}
        </label>
        <Input id="wallet-sub" name="sub" placeholder={t("wallet.lookupPlaceholder")} className="h-10 flex-1 rounded-xl" required autoComplete="off" data-testid="wallet-lookup" />
        <Button type="submit" variant="outline" className="h-10 rounded-xl">
          {t("wallet.open")}
        </Button>
      </form>
      {!overview ? (
        <Hint tone="warning">{t("errors.platform_unavailable")}</Hint>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label={t("wallet.total")} value={t("common.credits", { amount: f.number(overview.totalBalance) })} testId="wallet-total" />
            <Kpi label={t("wallet.wallets")} value={f.number(overview.wallets)} />
            <Kpi label={t("wallet.issued30")} value={f.number(sum("issued"))} />
            <Kpi label={t("wallet.spent30")} value={f.number(sum("spent"))} />
            <Kpi label={t("wallet.bought30")} value={f.number(sum("bought"))} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Panel title={t("overview.creditsTitle")} description={t("overview.creditsDescription")}>
              <DailyChart
                data={overview.days}
                series={[
                  { key: "issued", label: t("overview.issued") },
                  { key: "spent", label: t("overview.spent") },
                  { key: "bought", label: t("overview.bought") },
                ]}
              />
            </Panel>
            <Panel title={t("wallet.topHolders")}>
              {overview.topHolders.length === 0 ? (
                <Empty>{t("wallet.noHolders")}</Empty>
              ) : (
                <ol className="divide-y divide-border/60 text-sm" data-testid="wallet-top">
                  {overview.topHolders.map((h, i) => (
                    <li key={h.sub} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                        <AccountLink sub={h.sub} name={h.name || h.username} secondary={h.username ? `@${h.username}` : null} />
                      </div>
                      <a href={`/dashboard/admin/wallet/${encodeURIComponent(h.sub)}`} className="shrink-0 tabular-nums underline-offset-2 hover:underline">
                        {t("common.credits", { amount: f.number(h.balance) })}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}
