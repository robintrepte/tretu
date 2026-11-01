import { Coins, Gift, ShoppingCart, Sparkles, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/metadata";
import { platformDb } from "@/lib/platform/db";
import { getEconomy } from "@/lib/platform/economy";
import { formatNumber } from "@/lib/platform/format";
import { getTranslations } from "@/lib/platform/i18n";
import { dailyAvailable, getBalance, listTransactions } from "@/lib/platform/wallet";

import { getPageContext, loadSafely } from "../_components/page-context";
import { LoginRequired, PlatformPage, SectionCard, Unavailable } from "../_components/platform-page";
import { DailyClaim, WalletHistory } from "../_components/wallet-client";

const SAGA_CREDITS_URL = "https://saga.tretu.de/credits";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return pageMetadata({ title: t("wallet.metaTitle"), description: t("wallet.howTitle"), path: "/wallet", noIndex: true });
}

export default async function WalletPage() {
  const ctx = await getPageContext();
  const { t, locale } = ctx;
  const economy = getEconomy();
  const data =
    ctx.available && ctx.user
      ? await loadSafely(async () => {
          const sub = ctx.user!.sub;
          const balance = await getBalance(platformDb, sub);
          return {
            balance,
            daily: await dailyAvailable(platformDb, sub),
            items: await listTransactions(platformDb, sub, { limit: 25 }),
          };
        })
      : null;

  return (
    <PlatformPage ctx={ctx} title={t("wallet.title")} icon={Wallet}>
      {!ctx.available ? (
        <Unavailable ctx={ctx} />
      ) : !ctx.user ? (
        <LoginRequired ctx={ctx} feature={t("nav.wallet")} path="/wallet" />
      ) : !data ? (
        <Unavailable ctx={ctx} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <section className="relative overflow-hidden rounded-2xl bg-[var(--tretu-accent)] p-6 text-white shadow-sm md:p-8">
              <Coins className="absolute -right-6 -top-6 size-40 opacity-15" aria-hidden />
              <p className="text-sm font-medium uppercase tracking-wide text-white/80">{t("wallet.balanceLabel")}</p>
              <p className="mt-2 text-5xl font-bold tabular-nums md:text-6xl" data-testid="wallet-balance">
                {formatNumber(locale, data.balance)}
              </p>
              <p className="mt-1 text-lg text-white/90">{t("wallet.currency")}</p>
            </section>
            <DailyClaim available={data.daily} target={economy.dailyTopUpTarget} />
          </div>

          <SectionCard title={t("wallet.historyTitle")}>
            <WalletHistory initial={data.items} />
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title={t("wallet.howTitle")}>
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
                <Sparkles className="size-4 text-[var(--tretu-accent)]" aria-hidden />
                {t("wallet.earnTitle")}
              </h3>
              <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("wallet.earnWelcome", { amount: economy.welcomeBonus })}</li>
                {economy.dailyTopUpTarget > 0 ? <li>{t("wallet.earnDaily", { target: economy.dailyTopUpTarget })}</li> : null}
                <li>{t("wallet.earnBadges")}</li>
                {economy.gameWinReward > 0 ? (
                  <li>{t("wallet.earnWins", { amount: economy.gameWinReward, cap: economy.gameWinRewardDailyCap })}</li>
                ) : null}
              </ul>
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
                <Gift className="size-4 text-[var(--tretu-accent)]" aria-hidden />
                {t("wallet.spendTitle")}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("wallet.spendSaga")}</li>
                <li>{t("wallet.spendMore")}</li>
              </ul>
            </SectionCard>
            <SectionCard title={t("wallet.buyTitle")}>
              <p className="mb-4 text-muted-foreground">{t("wallet.buyText")}</p>
              <Button asChild className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
                <a href={SAGA_CREDITS_URL} target="_blank" rel="noopener noreferrer">
                  <ShoppingCart aria-hidden />
                  {t("wallet.buyButton")}
                </a>
              </Button>
            </SectionCard>
          </div>
        </div>
      )}
    </PlatformPage>
  );
}
