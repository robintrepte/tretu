"use client";

import {
  ChevronDown,
  Clock,
  Globe,
  HardDrive,
  Loader2,
  Play,
  Power,
  RotateCw,
  Server,
  Square,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { CopyButton } from "@/components/dashboard/copy-button";
import { JobLog } from "@/components/dashboard/instance/job-log";
import { useInstance } from "@/components/dashboard/instance/instance-context";
import { useFormat, useGameText } from "@/components/dashboard/use-format";
import { useNow } from "@/components/dashboard/use-now";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { getGameDefinition } from "@/lib/games/catalog";
import { cn } from "@/lib/utils";

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 dark:bg-muted/15">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function OverviewTab() {
  const t = useTranslations("dashboard.overview");
  const tDash = useTranslations("dashboard");
  const format = useFormat();
  const gameText = useGameText();
  const { detail, can, runAction } = useInstance();
  const now = useNow();
  const uptimeMs = now !== null && detail.hostSince ? now - Date.parse(detail.hostSince) : null;
  const def = getGameDefinition(detail.gameType);
  const [showFailedLog, setShowFailedLog] = useState(false);
  const [showJobLog, setShowJobLog] = useState(true);

  const hostUp = Boolean(detail.ip);
  const busy = detail.state === "busy";
  const job = detail.activeJob;

  const start = () => runAction("start", { success: t("startSuccess") });
  const hibernate = () =>
    runAction("hibernate", {
      success: t("hibernateSuccess"),
      confirm: {
        title: t("hibernateTitle"),
        description: (
          <>
            <p>{detail.backupOnHibernate ? t("hibernateTextBackup") : t("hibernateText")}</p>
            {detail.players ? (
              <p className="font-medium text-foreground">{t("playersOnlineWarning", { count: detail.players })}</p>
            ) : null}
          </>
        ),
        confirmLabel: tDash("actions.hibernate"),
      },
    });
  const jobLabel = (actionType: string, fallback: string) =>
    tDash.has(`actions.${actionType}`) ? tDash(`actions.${actionType}`) : fallback;

  return (
    <div className="space-y-5">
      {job ? (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-sky-500" />
              {jobLabel(job.actionType, job.label)}
              {job.status === "queued" ? <span className="text-sm font-normal text-muted-foreground">{t("queued")}</span> : null}
            </span>
          }
          description={job.progress ?? t("preparing")}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setShowJobLog((v) => !v)}>
              {t("details")} <ChevronDown className={cn("transition-transform", showJobLog && "rotate-180")} />
            </Button>
          }
        >
          {showJobLog ? <JobLog instanceId={detail.id} jobId={job.id} live /> : null}
        </Panel>
      ) : null}

      {!job && detail.lastFailedJob ? (
        <div className="space-y-2">
          <Hint tone="danger">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {t.rich("failed", {
                    action: jobLabel(detail.lastFailedJob.actionType, detail.lastFailedJob.label),
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                  {detail.lastFailedJob.finishedAt && now !== null
                    ? ` (${format.relative(detail.lastFailedJob.finishedAt, now)})`
                    : ""}
                  : {detail.lastFailedJob.error}
                </span>
              </span>
              <button type="button" className="text-xs underline-offset-2 hover:underline" onClick={() => setShowFailedLog((v) => !v)}>
                {showFailedLog ? t("hideLog") : t("showLog")}
              </button>
            </div>
          </Hint>
          {showFailedLog ? <JobLog instanceId={detail.id} jobId={detail.lastFailedJob.id} live={false} /> : null}
        </div>
      ) : null}

      <Panel title={t("connect")} description={def ? gameText.connectHint(def) : undefined}>
        {detail.address ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/40 py-1.5 pl-4 pr-1.5 dark:bg-muted/20">
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-base font-semibold">{detail.address}</span>
              <CopyButton value={detail.address} label={tDash("grid.copyAddress")} />
            </div>
            {!hostUp ? <span className="text-sm text-muted-foreground">{t("reachableWhenRunning")}</span> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("addressWhenRunning")}</p>
        )}
        {hostUp && detail.address !== detail.ip && detail.ip ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("ip")} <span className="font-mono">{detail.ip}</span>
          </p>
        ) : null}
      </Panel>

      <Panel title={t("controls")}>
        <div className="flex flex-wrap gap-2.5">
          {!hostUp || detail.state === "stopped" ? (
            <Button
              size="lg"
              disabled={busy || !can("instances:start") || !detail.supported}
              onClick={start}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              <Play /> {tDash("actions.start")}
            </Button>
          ) : null}
          {hostUp ? (
            <Button
              size="lg"
              variant="outline"
              disabled={busy || !can("instances:stop")}
              onClick={hibernate}
              className="rounded-xl"
            >
              <Power /> {tDash("actions.hibernate")}
            </Button>
          ) : null}
          {hostUp && detail.state !== "stopped" ? (
            <>
              <Button
                size="lg"
                variant="outline"
                disabled={busy || !can("instances:restart")}
                onClick={() => runAction("restart", { success: t("restartSuccess") })}
                className="rounded-xl"
              >
                <RotateCw /> {tDash("actions.restart")}
              </Button>
              <Button
                size="lg"
                variant="ghost"
                disabled={busy || !can("instances:stop")}
                onClick={() =>
                  runAction("stop", {
                    confirm: {
                      title: t("stopTitle"),
                      description: t("stopText"),
                      confirmLabel: tDash("actions.stop"),
                    },
                  })
                }
                className="rounded-xl text-muted-foreground"
              >
                <Square /> {t("stopOnly")}
              </Button>
            </>
          ) : null}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t.rich("controlsHint", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="size-3.5" />}
          label={t("players")}
          value={detail.players !== null ? `${detail.players}${detail.maxPlayers ? ` / ${detail.maxPlayers}` : ""}` : "–"}
          sub={def && !def.features.playerCount ? t("noPlayerCount") : undefined}
        />
        <Stat
          icon={<Server className="size-3.5" />}
          label={t("serverType")}
          value={<span className="font-mono uppercase">{detail.serverType}</span>}
          sub={`${tDash("common.perHour", { price: format.euro(detail.pricePerHour, 3) })} · ${detail.region}`}
        />
        <Stat
          icon={<Clock className="size-3.5" />}
          label={hostUp ? t("runningSince") : t("status")}
          value={hostUp && uptimeMs !== null ? format.duration(uptimeMs) : hostUp ? "–" : tDash("state.offline.label")}
          sub={
            detail.idleShutdownAt && now !== null
              ? t("autoOffAt", { when: format.relative(detail.idleShutdownAt, now) })
              : hostUp && detail.pricePerHour && uptimeMs !== null
                ? t("costSoFar", { cost: format.euro((uptimeMs / 3_600_000) * detail.pricePerHour) })
                : detail.idleMinutes > 0
                  ? t("autoOffAfter", { minutes: detail.idleMinutes })
                  : t("noAutoOff")
          }
        />
        <Stat
          icon={<HardDrive className="size-3.5" />}
          label={t("storage")}
          value={detail.volume ? `${detail.volume.sizeGb} GB` : "–"}
          sub={
            detail.volume?.usedBytes != null && detail.volume.totalBytes
              ? t("storageUsed", {
                  used: format.bytes(detail.volume.usedBytes),
                  percent: Math.round((detail.volume.usedBytes / detail.volume.totalBytes) * 100),
                })
              : detail.volume
                ? t("storageWhenRunning")
                : t("storageOnFirstStart")
          }
        />
      </div>
    </div>
  );
}
