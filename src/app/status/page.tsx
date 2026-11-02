import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { JsonLdWebPage } from "@/components/json-ld-webpage";
import { PageTitle } from "@/components/page-title";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { BAR_CLASSES, StatusBars } from "@/components/status/status-bars";
import { INTL_LOCALE, resolveLocale } from "@/i18n/config";
import { translatedMetadata } from "@/lib/metadata";
import { getStatusOverview, type Bucket, type DisplayState, type ServiceStatus } from "@/lib/status/read";
import { STATUS_TIME_ZONE } from "@/lib/status/store";
import { cn } from "@/lib/utils";

/** Reads the database (cached 30 s in src/lib/status/read.ts), never the services themselves. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("status", "/status", { keywords: ["Status", "Tretu", "Verfügbarkeit", "Uptime"] });
}

const TONE: Record<DisplayState | "unavailable", { badge: string; dot: string; panel: string }> = {
  up: {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    panel: "border-emerald-500/40 bg-emerald-500/10",
  },
  degraded: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    panel: "border-amber-500/40 bg-amber-500/10",
  },
  down: { badge: "bg-red-500/15 text-red-700 dark:text-red-300", dot: "bg-red-500", panel: "border-red-500/40 bg-red-500/10" },
  maintenance: { badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300", dot: "bg-sky-500", panel: "border-sky-500/40 bg-sky-500/10" },
  unknown: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60", panel: "border-border/70 bg-muted/40" },
  unavailable: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60", panel: "border-border/70 bg-muted/40" },
};

export default async function StatusPage() {
  const [locale, t, overview] = await Promise.all([getLocale().then(resolveLocale), getTranslations("status"), getStatusOverview()]);
  const tMeta = await getTranslations("meta.status");
  const intl = INTL_LOCALE[locale];
  const dateTime = new Intl.DateTimeFormat(intl, { timeZone: STATUS_TIME_ZONE, dateStyle: "medium", timeStyle: "short" });
  const time = new Intl.DateTimeFormat(intl, { timeZone: STATUS_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const percent = new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 2 });
  const number = new Intl.NumberFormat(intl);
  const pct = (value: number) => percent.format(value / 100);

  const overall: DisplayState | "unavailable" = overview.available ? overview.status : "unavailable";
  const updated = overview.updatedAt ? new Date(overview.updatedAt) : null;
  const inMaintenance = overview.services.filter((s) => s.maintenance).length;

  const summary = (buckets: Bucket[]): string => {
    const checks = buckets.reduce((n, b) => n + b.checks, 0);
    const down = buckets.reduce((n, b) => n + b.down, 0);
    return checks ? pct(Math.floor(((checks - down) / checks) * 10_000) / 100) : t("noData");
  };
  const bucketTitle = (label: string, bucket: Bucket): string => {
    if (!bucket.checks) return t("bucket", { label, summary: t("noData") });
    const base = t("bucketSummary", { percent: summary([bucket]), checks: bucket.checks });
    const issues = bucket.degraded || bucket.down ? ` · ${t("bucketIssues", { degraded: bucket.degraded, down: bucket.down })}` : "";
    return t("bucket", { label, summary: base + issues });
  };
  const hourLabel = (start: string) => {
    const from = new Date(start);
    const to = new Date(from.getTime() + 3600_000);
    return t("hourLabel", { time: `${time.format(from)}–${time.format(to)}` });
  };
  const dayLabel = (date: string) => day.format(new Date(`${date}T12:00:00Z`));
  const usersLabel = (service: ServiceStatus): string | null => {
    if (service.checkState !== "up" || service.usersOnline === null) return null;
    if (service.kind === "teamspeak") return t("users", { online: service.usersOnline });
    if (service.kind !== "minecraft") return null;
    return service.usersMax !== null
      ? t("playersOf", { online: number.format(service.usersOnline), max: number.format(service.usersMax) })
      : t("players", { online: service.usersOnline });
  };

  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <JsonLdWebPage name={tMeta("title")} description={tMeta("description")} path="/status" lang={locale} />
      <AutoRefresh seconds={60} />
      <div className="mx-auto max-w-[1200px] space-y-8">
        <PageTitle title={t("title")} icon="status" />
        <p className="-mt-8 max-w-3xl text-muted-foreground">{t("intro")}</p>

        {overview.notice ? (
          <div role="note" data-testid="status-notice" className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm leading-relaxed">
            <span className="font-semibold text-foreground">{t("notice")}: </span>
            <span className="text-foreground/90">{overview.notice}</span>
          </div>
        ) : null}

        <section
          aria-live="polite"
          data-testid="status-overall"
          data-state={overall}
          className={cn("flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4", TONE[overall].panel)}
        >
          <div className="flex items-center gap-3">
            <span className={cn("inline-flex size-3 shrink-0 rounded-full", TONE[overall].dot)} aria-hidden />
            <div>
              <h2 className="text-xl font-semibold text-foreground">{t(`overall.${overall}`)}</h2>
              {inMaintenance && overall !== "maintenance" ? (
                <p className="text-sm text-muted-foreground" data-testid="status-maintenance-count">
                  {t("maintenanceCount", { count: inMaintenance })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="text-sm text-muted-foreground" data-testid="status-updated">
            {updated ? t("updated", { time: dateTime.format(updated) }) : t("neverChecked")}
          </div>
        </section>

        {overview.available && updated && overview.stale ? (
          <p role="status" data-testid="status-stale" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            {t("stale", { time: dateTime.format(updated) })}
          </p>
        ) : null}

        <ul className="space-y-4">
          {overview.services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              stateLabel={t(`state.${service.state}`)}
              responseLabel={service.responseMs !== null ? t("responseMs", { ms: number.format(service.responseMs) }) : null}
              responseTitle={t("responseTime")}
              usersLabel={usersLabel(service)}
              sinceLabel={
                service.maintenance
                  ? service.maintenance.until
                    ? t("maintenanceUntil", { time: dateTime.format(new Date(service.maintenance.until)) })
                    : null
                  : service.since && service.state !== "unknown"
                    ? t("since", { time: dateTime.format(new Date(service.since)) })
                    : null
              }
              maintenanceNote={service.maintenance?.note ?? null}
              excludedLabel={!service.maintenance && !service.inOverall ? t("notInOverall") : null}
              hours={
                <StatusBars
                  testId={`status-hours-${service.id}`}
                  label={t("last24h")}
                  summary={service.uptime24h !== null ? t("uptime", { percent: pct(service.uptime24h) }) : t("noData")}
                  buckets={service.hours}
                  titles={service.hours.map((b) => bucketTitle(hourLabel(b.start), b))}
                  startLabel={t("hoursAgo")}
                  endLabel={t("now")}
                />
              }
              days={
                <StatusBars
                  testId={`status-days-${service.id}`}
                  label={t("last90d")}
                  summary={service.uptime90d !== null ? t("uptime", { percent: pct(service.uptime90d) }) : t("noData")}
                  buckets={service.days}
                  titles={service.days.map((b) => bucketTitle(dayLabel(b.start), b))}
                  startLabel={t("daysAgo")}
                  endLabel={t("today")}
                />
              }
            />
          ))}
        </ul>

        <div className="space-y-3 text-sm text-muted-foreground">
          <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t("legendLabel")}>
            {(["up", "degraded", "down", "none"] as const).map((tone) => (
              <li key={tone} className="flex items-center gap-2">
                <span className={cn("inline-block h-3 w-1.5 rounded-[2px]", BAR_CLASSES[tone])} aria-hidden />
                {t(`legend.${tone}`)}
              </li>
            ))}
          </ul>
          <p className="max-w-3xl leading-relaxed">{t("explanation")}</p>
          <p>
            {t.rich("api", {
              link: (chunks) => (
                <a href="/api/status" className="font-medium text-foreground underline-offset-4 hover:text-[var(--tretu-accent)] hover:underline">
                  {chunks}
                </a>
              ),
            })}{" "}
            {t("autoRefresh")}
          </p>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  stateLabel,
  responseLabel,
  responseTitle,
  usersLabel,
  sinceLabel,
  maintenanceNote,
  excludedLabel,
  hours,
  days,
}: {
  service: ServiceStatus;
  stateLabel: string;
  responseLabel: string | null;
  responseTitle: string;
  usersLabel: string | null;
  sinceLabel: string | null;
  maintenanceNote: string | null;
  excludedLabel: string | null;
  hours: ReactNode;
  days: ReactNode;
}) {
  const tone = TONE[service.state];
  return (
    <li
      data-testid={`status-service-${service.id}`}
      data-state={service.state}
      className="space-y-5 rounded-2xl border border-border/70 bg-card p-5 text-card-foreground shadow-sm md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight text-foreground">{service.name}</h3>
          <p className="text-sm text-muted-foreground">{service.host}</p>
          {usersLabel ? (
            <p className="mt-1 text-sm font-medium text-foreground/80 tabular-nums" data-testid="status-users">
              {usersLabel}
            </p>
          ) : null}
          {maintenanceNote ? (
            <p className="mt-1 text-sm text-foreground/90" data-testid="status-maintenance-note">
              {maintenanceNote}
            </p>
          ) : null}
          {excludedLabel ? (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="status-excluded">
              {excludedLabel}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            data-testid="status-state"
            className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tone.badge)}
          >
            <span className={cn("inline-flex size-2 rounded-full", tone.dot)} aria-hidden />
            {stateLabel}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {responseLabel ? (
              <span title={responseTitle} data-testid="status-response">
                {responseLabel}
              </span>
            ) : null}
            {responseLabel && sinceLabel ? " · " : null}
            {sinceLabel}
          </span>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {hours}
        {days}
      </div>
    </li>
  );
}
