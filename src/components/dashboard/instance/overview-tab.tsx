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
import { useState, type ReactNode } from "react";

import { CopyButton } from "@/components/dashboard/copy-button";
import { JobLog } from "@/components/dashboard/instance/job-log";
import { useInstance } from "@/components/dashboard/instance/instance-context";
import { useNow } from "@/components/dashboard/use-now";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, formatEuro, formatRelative } from "@/lib/dashboard/format";
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
  const { detail, can, runAction } = useInstance();
  const now = useNow();
  const uptimeMs = now !== null && detail.hostSince ? now - Date.parse(detail.hostSince) : null;
  const def = getGameDefinition(detail.gameType);
  const [showFailedLog, setShowFailedLog] = useState(false);
  const [showJobLog, setShowJobLog] = useState(true);

  const hostUp = Boolean(detail.ip);
  const busy = detail.state === "busy";
  const job = detail.activeJob;

  const start = () => runAction("start", { success: "Server wird gestartet – das dauert meist 2–4 Minuten." });
  const hibernate = () =>
    runAction("hibernate", {
      success: "Server wird ausgeschaltet.",
      confirm: {
        title: "Server ausschalten?",
        description: (
          <>
            <p>
              Das Spiel wird sauber beendet{detail.backupOnHibernate ? ", ein Backup erstellt" : ""} und die VM gelöscht. Welt
              und Einstellungen bleiben auf dem Speicher erhalten – es fallen nur noch Speicherkosten an.
            </p>
            {detail.players ? <p className="font-medium text-foreground">Es sind gerade {detail.players} Spieler online!</p> : null}
          </>
        ),
        confirmLabel: "Ausschalten",
      },
    });

  return (
    <div className="space-y-5">
      {job ? (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-sky-500" />
              {job.label}
              {job.status === "queued" ? <span className="text-sm font-normal text-muted-foreground">(wartet)</span> : null}
            </span>
          }
          description={job.progress ?? "Wird vorbereitet…"}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setShowJobLog((v) => !v)}>
              Details <ChevronDown className={cn("transition-transform", showJobLog && "rotate-180")} />
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
                  <strong>{detail.lastFailedJob.label}</strong> ist fehlgeschlagen
                  {detail.lastFailedJob.finishedAt && now !== null ? ` (${formatRelative(detail.lastFailedJob.finishedAt, now)})` : ""}:{" "}
                  {detail.lastFailedJob.error}
                </span>
              </span>
              <button type="button" className="text-xs underline-offset-2 hover:underline" onClick={() => setShowFailedLog((v) => !v)}>
                {showFailedLog ? "Log ausblenden" : "Log anzeigen"}
              </button>
            </div>
          </Hint>
          {showFailedLog ? <JobLog instanceId={detail.id} jobId={detail.lastFailedJob.id} live={false} /> : null}
        </div>
      ) : null}

      <Panel title="Verbinden" description={def?.connectHint}>
        {detail.address ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/40 py-1.5 pl-4 pr-1.5 dark:bg-muted/20">
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-base font-semibold">{detail.address}</span>
              <CopyButton value={detail.address} label="Adresse kopieren" />
            </div>
            {!hostUp ? <span className="text-sm text-muted-foreground">Erreichbar, sobald der Server läuft.</span> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Die Adresse erscheint, sobald der Server läuft.</p>
        )}
        {hostUp && detail.address !== detail.ip && detail.ip ? (
          <p className="mt-2 text-xs text-muted-foreground">
            IP-Adresse: <span className="font-mono">{detail.ip}</span>
          </p>
        ) : null}
      </Panel>

      <Panel title="Steuerung">
        <div className="flex flex-wrap gap-2.5">
          {!hostUp || detail.state === "stopped" ? (
            <Button
              size="lg"
              disabled={busy || !can("instances:start") || !detail.supported}
              onClick={start}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              <Play /> Starten
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
              <Power /> Ausschalten
            </Button>
          ) : null}
          {hostUp && detail.state !== "stopped" ? (
            <>
              <Button
                size="lg"
                variant="outline"
                disabled={busy || !can("instances:restart")}
                onClick={() => runAction("restart", { success: "Spielserver wird neu gestartet." })}
                className="rounded-xl"
              >
                <RotateCw /> Neustart
              </Button>
              <Button
                size="lg"
                variant="ghost"
                disabled={busy || !can("instances:stop")}
                onClick={() =>
                  runAction("stop", {
                    confirm: {
                      title: "Nur das Spiel stoppen?",
                      description:
                        "Der Spielserver wird beendet, die VM läuft aber weiter und kostet weiter Geld. Zum Sparen lieber „Ausschalten“ verwenden.",
                      confirmLabel: "Spiel stoppen",
                    },
                  })
                }
                className="rounded-xl text-muted-foreground"
              >
                <Square /> Nur Spiel stoppen
              </Button>
            </>
          ) : null}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          <strong>Starten</strong> erstellt die VM und richtet alles automatisch ein (2–4 Min., Modpacks länger).{" "}
          <strong>Ausschalten</strong> löscht die VM – Welt & Einstellungen bleiben gespeichert.
        </p>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="size-3.5" />}
          label="Spieler online"
          value={detail.players !== null ? `${detail.players}${detail.maxPlayers ? ` / ${detail.maxPlayers}` : ""}` : "–"}
          sub={def && !def.features.playerCount ? "Spiel meldet keine Spielerzahl" : undefined}
        />
        <Stat
          icon={<Server className="size-3.5" />}
          label="Servertyp"
          value={<span className="font-mono uppercase">{detail.serverType}</span>}
          sub={`${formatEuro(detail.pricePerHour, 3)} / Std. · ${detail.region}`}
        />
        <Stat
          icon={<Clock className="size-3.5" />}
          label={hostUp ? "Läuft seit" : "Status"}
          value={hostUp && uptimeMs !== null ? formatDuration(uptimeMs) : hostUp ? "–" : "Aus"}
          sub={
            detail.idleShutdownAt && now !== null
              ? `Auto-Aus ${formatRelative(detail.idleShutdownAt, now)} ohne Spieler`
              : hostUp && detail.pricePerHour && uptimeMs !== null
                ? `bisher ca. ${formatEuro((uptimeMs / 3_600_000) * detail.pricePerHour)}`
                : detail.idleMinutes > 0
                  ? `Auto-Aus nach ${detail.idleMinutes} Min. ohne Spieler`
                  : "Kein Auto-Aus"
          }
        />
        <Stat
          icon={<HardDrive className="size-3.5" />}
          label="Speicher"
          value={detail.volume ? `${detail.volume.sizeGb} GB` : "–"}
          sub={
            detail.volume?.usedBytes != null && detail.volume.totalBytes
              ? `${formatBytes(detail.volume.usedBytes)} belegt (${Math.round((detail.volume.usedBytes / detail.volume.totalBytes) * 100)} %)`
              : detail.volume
                ? "Belegung sichtbar, wenn der Server läuft"
                : "Wird beim ersten Start angelegt"
          }
        />
      </div>
    </div>
  );
}
