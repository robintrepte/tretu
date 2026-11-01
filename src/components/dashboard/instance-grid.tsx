"use client";

import { ChevronRight, Globe, Loader2, Play, Power, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/dashboard/copy-button";
import { GameThumbnail } from "@/components/dashboard/game-thumbnail";
import { StateBadge } from "@/components/dashboard/state-badge";
import { useFormat, useGameText } from "@/components/dashboard/use-format";
import { useNow } from "@/components/dashboard/use-now";
import { Button } from "@/components/ui/button";
import { dashboardApi } from "@/lib/api/dashboard-client";
import type { InstanceSummary } from "@/lib/dashboard/view";
import { getGameDefinition } from "@/lib/games/catalog";

function InstanceCard({
  instance,
  canStart,
  canStop,
  onAction,
}: {
  instance: InstanceSummary;
  canStart: boolean;
  canStop: boolean;
  onAction: (id: number, action: "start" | "hibernate") => Promise<void>;
}) {
  const t = useTranslations("dashboard");
  const format = useFormat();
  const gameText = useGameText();
  const def = getGameDefinition(instance.gameType);
  const [pending, setPending] = useState(false);
  const now = useNow();
  const hostUp = Boolean(instance.ip);
  const busy = instance.state === "busy";

  const act = async (action: "start" | "hibernate") => {
    if (action === "hibernate" && instance.players && !window.confirm(t("grid.confirmHibernate", { count: instance.players }))) {
      return;
    }
    setPending(true);
    await onAction(instance.id, action);
    setPending(false);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/dashboard/games/${instance.id}`} className="relative block">
        <GameThumbnail gameType={instance.gameType} size="md" />
        <StateBadge
          state={instance.state}
          label={instance.activeJob ? `${t(`actions.${instance.activeJob.actionType}`)}…` : undefined}
          className="absolute right-3 top-3 bg-background/90 shadow-sm backdrop-blur"
        />
      </Link>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <Link href={`/dashboard/games/${instance.id}`} className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight group-hover:text-[var(--tretu-accent)]">{instance.name}</h3>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{def ? gameText.label(def) : instance.gameLabel}</p>
        </Link>

        <div className="mt-4 space-y-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm dark:bg-muted/25">
          <div className="flex min-w-0 items-center gap-2.5">
            <Globe className="size-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{instance.address ?? t("grid.addressPending")}</span>
            {instance.address && hostUp ? <CopyButton value={instance.address} label={t("grid.copyAddress")} /> : null}
          </div>
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Users className="size-4 shrink-0 opacity-70" />
            <span>
              {instance.players !== null
                ? t("grid.playersOnline", {
                    players: instance.maxPlayers ? `${instance.players} / ${instance.maxPlayers}` : String(instance.players),
                  })
                : hostUp
                  ? t("grid.playersUnknown")
                  : t("state.offline.label")}
            </span>
          </div>
          {instance.idleShutdownAt && now !== null ? (
            <p className="text-xs text-muted-foreground">{t("grid.autoOff", { when: format.relative(instance.idleShutdownAt, now) })}</p>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {hostUp ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              disabled={busy || pending || !canStop}
              onClick={() => void act("hibernate")}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Power />} {t("actions.hibernate")}
            </Button>
          ) : (
            <Button
              size="sm"
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-600/90"
              disabled={busy || pending || !canStart || !instance.supported}
              onClick={() => void act("start")}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Play />} {t("actions.start")}
            </Button>
          )}
          <span className="text-xs tabular-nums text-muted-foreground">{t("common.perHour", { price: format.euro(instance.pricePerHour, 3) })}</span>
          <Link
            href={`/dashboard/games/${instance.id}`}
            className="inline-flex items-center gap-0.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("grid.manage")} <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function InstanceGrid({
  initial,
  canStart,
  canStop,
}: {
  initial: InstanceSummary[];
  canStart: boolean;
  canStop: boolean;
}) {
  const t = useTranslations("dashboard");
  const format = useFormat();
  const [instances, setInstances] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      setInstances(await dashboardApi<InstanceSummary[]>("/api/internal/dashboard/instances"));
    } catch {
      // keep last state
    }
  }, []);

  const anyActive = instances.some((i) => i.state === "busy" || i.state === "starting");
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), anyActive ? 3000 : 15_000);
    return () => clearInterval(timer);
  }, [anyActive, refresh]);

  const onAction = async (id: number, action: "start" | "hibernate") => {
    try {
      await dashboardApi(`/api/internal/dashboard/instances/${id}/actions`, { method: "POST", json: { action } });
      toast.success(action === "start" ? t("grid.starting") : t("grid.stopping"));
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const online = instances.filter((i) => i.ip);
  const costPerHour = online.reduce((sum, i) => sum + (i.pricePerHour ?? 0), 0);

  return (
    <div className="space-y-5">
      {online.length ? (
        <p className="text-sm text-muted-foreground">
          {t.rich("grid.summary", {
            running: online.length,
            total: instances.length,
            cost: format.euro(costPerHour, 3),
            strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {instances.map((instance) => (
          <InstanceCard key={instance.id} instance={instance} canStart={canStart} canStop={canStop} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}
