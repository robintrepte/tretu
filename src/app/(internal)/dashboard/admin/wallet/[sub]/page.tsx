import { Coins, Undo2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { adjustBalanceAction, reverseTransactionAction } from "@/app/(internal)/dashboard/admin/actions";
import { TextField } from "@/components/admin/fields";
import { ReasonDialog } from "@/components/admin/reason-dialog";
import { Empty, Kpi, PageHeader, Pill } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { SUB_PATTERN } from "@/lib/admin/accounts";
import { appName } from "@/lib/admin/apps";
import { adminFormat } from "@/lib/admin/format";
import { ADMIN_LEDGER_APP, walletOfUser } from "@/lib/admin/wallet-admin";
import { platformDb } from "@/lib/platform/db";
import { getDirectoryUser } from "@/lib/platform/directory";

export const dynamic = "force-dynamic";

export default async function UserWalletPage({ params, searchParams }: { params: Promise<{ sub: string }>; searchParams: Promise<{ before?: string }> }) {
  await requireAccountAdminPage();
  const sub = (await params).sub;
  const before = (await searchParams).before ?? null;
  const [t, f] = await Promise.all([getTranslations("admin"), adminFormat()]);
  if (!SUB_PATTERN.test(sub)) return <Hint tone="danger">{t("errors.user_not_found")}</Hint>;

  const [user, wallet] = await Promise.all([
    getDirectoryUser(platformDb, sub).catch(() => null),
    walletOfUser(platformDb, sub, { before: before && /^[0-9a-f-]{36}$/i.test(before) ? before : null }).catch(() => null),
  ]);
  if (!wallet) return <Hint tone="warning">{t("errors.platform_unavailable")}</Hint>;
  const name = user?.name || user?.username || sub;
  const kindLabel = (kind: string) => (t.has(`wallet.kinds.${kind}`) ? t(`wallet.kinds.${kind}`) : kind);
  const last = wallet.items[wallet.items.length - 1];

  return (
    <section className="space-y-6">
      <PageHeader
        title={t("wallet.userTitle", { name })}
        intro={
          <Link href={`/dashboard/admin/konten/${encodeURIComponent(sub)}`} className="underline-offset-2 hover:underline">
            {t("common.openAccount")}
          </Link>
        }
        actions={
          <ReasonDialog
            action={adjustBalanceAction}
            hidden={{ sub }}
            withRequestId
            trigger={<><Coins /> {t("wallet.adjust")}</>}
            triggerVariant="default"
            testId="action-adjust"
            title={t("wallet.adjustTitle")}
            description={t("wallet.adjustDescription")}
            confirmLabel={t("wallet.adjust")}
          >
            <TextField name="amount" label={t("wallet.amount")} type="number" testId="adjust-amount" />
          </ReasonDialog>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t("wallet.balance")} value={wallet.balance === null ? t("account.noWallet") : t("common.credits", { amount: f.number(wallet.balance) })} testId="wallet-balance" />
      </div>
      <Panel title={t("wallet.history")}>
        {wallet.items.length === 0 ? (
          <Empty>{t("wallet.noHistory")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="wallet-history">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t("wallet.columns.date")}</th>
                  <th className="py-2 font-medium">{t("wallet.columns.kind")}</th>
                  <th className="py-2 font-medium">{t("wallet.columns.reason")}</th>
                  <th className="py-2 font-medium">{t("wallet.columns.app")}</th>
                  <th className="py-2 text-right font-medium">{t("wallet.columns.amount")}</th>
                  <th className="py-2 text-right font-medium">{t("wallet.columns.balanceAfter")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {wallet.items.map((item) => {
                  const reversed = wallet.reversed.has(item.id);
                  const isReversal = item.app === ADMIN_LEDGER_APP && Boolean(item.ref) && /^[0-9a-f-]{36}$/i.test(item.ref ?? "");
                  return (
                    <tr key={item.id} data-testid="wallet-row">
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{f.dateTime(item.createdAt)}</td>
                      <td className="py-2 pr-3">{kindLabel(item.kind)}</td>
                      <td className="max-w-[18rem] truncate py-2 pr-3 text-muted-foreground">{item.reason ?? t("common.none")}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{item.app === "platform" ? "Tretu" : appName(item.app)}</td>
                      <td className={`py-2 pr-3 text-right font-medium tabular-nums ${item.amount < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                        {f.signed(item.amount)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{f.number(item.balanceAfter)}</td>
                      <td className="py-2 text-right">
                        {reversed ? (
                          <Pill>{t("wallet.isReversed")}</Pill>
                        ) : isReversal ? null : (
                          <ReasonDialog
                            action={reverseTransactionAction}
                            hidden={{ transactionId: item.id }}
                            trigger={<><Undo2 /> {t("wallet.reverse")}</>}
                            triggerVariant="ghost"
                            triggerSize="xs"
                            testId={`action-reverse-${item.id}`}
                            title={t("wallet.reverseTitle")}
                            description={t("wallet.reverseDescription", { amount: f.signed(-item.amount) })}
                            confirmLabel={t("wallet.reverse")}
                            destructive
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {wallet.items.length === 50 && last ? (
          <Link href={`/dashboard/admin/wallet/${encodeURIComponent(sub)}?before=${last.id}`} className="mt-4 inline-block text-sm underline-offset-2 hover:underline">
            {t("wallet.olderLink")} →
          </Link>
        ) : null}
      </Panel>
    </section>
  );
}
