"use client";

import { CalendarCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getBadge } from "@/lib/platform/badges";
import { formatDateTime, formatNumber } from "@/lib/platform/format";
import type { WalletHistoryItem } from "@/lib/platform/wallet";
import { cn } from "@/lib/utils";

import { meApi } from "./api";
import { useLocale, useT } from "./i18n-provider";

export function DailyClaim({ available, target }: { available: boolean; target: number }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(available);
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarCheck className="size-5 text-[var(--tretu-accent)]" aria-hidden />
          {t("wallet.dailyTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("wallet.dailyText", { target })}</p>
      </div>
      {open && target > 0 ? (
        <Button
          size="lg"
          disabled={busy}
          className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
          onClick={async () => {
            setBusy(true);
            try {
              const res = await meApi<{ granted: number }>("/wallet/daily", { method: "POST", body: {} });
              if (res.granted > 0) toast.success(t("wallet.dailyGranted", { amount: res.granted }));
              else toast.message(t("wallet.dailyNothing", { target }));
              setOpen(false);
              router.refresh();
            } catch {
              toast.error(t("common.error"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("wallet.dailyClaim")}
        </Button>
      ) : (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("wallet.dailyClaimed")}</p>
      )}
    </section>
  );
}

export function WalletHistory({ initial }: { initial: WalletHistoryItem[] }) {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length >= 25);
  if (!items.length) return <p className="text-muted-foreground">{t("wallet.historyEmpty")}</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/70">
        {items.map((item) => {
          const kindKey = `wallet.kinds.${item.kind}`;
          const kind = t(kindKey) === kindKey ? item.kind : t(kindKey);
          const appKey = `apps.${item.app}`;
          // Platform bookings are described in the viewer's language (badge title for badge rewards).
          const badge = item.app === "platform" && item.ref ? getBadge(item.ref) : undefined;
          const winApp = item.app === "platform" && item.kind === "reward" && item.ref?.includes(":") ? item.ref.split(":")[0] : null;
          const label = badge
            ? `${kind}: ${badge.title[locale]}`
            : winApp
              ? t("wallet.winReward", { app: t(`apps.${winApp}`) === `apps.${winApp}` ? winApp : t(`apps.${winApp}`) })
              : item.app === "platform"
                ? kind
                : item.reason || kind;
          return (
            <li key={item.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {kind} · {t(appKey) === appKey ? item.app : t(appKey)} · {formatDateTime(locale, item.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("font-semibold tabular-nums", item.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                  {item.amount > 0 ? "+" : "−"}
                  {formatNumber(locale, Math.abs(item.amount))} TC
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">{t("wallet.balanceAfter", { balance: item.balanceAfter })}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const page = await meApi<{ items: WalletHistoryItem[] }>(`/wallet?limit=25&before=${items[items.length - 1].id}`);
                setItems((prev) => [...prev, ...page.items]);
                setHasMore(page.items.length >= 25);
              } catch {
                toast.error(t("common.error"));
              }
            }}
          >
            {t("wallet.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
