/**
 * What tretu.de/status and `/api/status` show, read from the database only (the services are never called on a
 * request). Cached in memory for {@link CACHE_MS}; when the database is unreachable, the last good answer is
 * served. When the worker stops, the page keeps showing the last results with their time ("Stand").
 */
import { and, gte, inArray } from "drizzle-orm";

import { platformStatusRollups, platformStatusServices } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { getPlatformDb, isPlatformDbConfigured, type Executor } from "@/lib/platform/db";
import type { ServiceState } from "@/lib/status/check";
import { STATUS_TIME_ZONE } from "@/lib/status/store";
import { maintenanceActive, statusTargets, type Maintenance, type StatusTarget } from "@/lib/status/targets";

export const CACHE_MS = 30_000;
/** Without a check for this long the data counts as stale (the worker runs every minute). */
export const STALE_AFTER_MS = 3 * 60_000;
export const HOURS = 24;
export const DAYS = 90;

/** A check result, "unknown" without one, or "maintenance" while a configured maintenance is in effect. */
export type DisplayState = ServiceState | "unknown" | "maintenance";

export type Bucket = {
  /** ISO start of the hour, or the calendar day `YYYY-MM-DD` (Europe/Berlin). */
  start: string;
  checks: number;
  up: number;
  degraded: number;
  down: number;
};

export type ServiceStatus = {
  id: string;
  /** http | minecraft | teamspeak */
  kind: StatusTarget["kind"];
  name: string;
  host: string;
  /** "maintenance" while in maintenance, else the latest check's state. */
  state: DisplayState;
  /** The latest check's state, also during maintenance. */
  checkState: ServiceState | "unknown";
  /** The maintenance in effect (null when none). */
  maintenance: Maintenance | null;
  /** Whether the service counts for the overall status (not excluded by configuration, not in maintenance). */
  inOverall: boolean;
  /** Start of the latest check's state (ISO). */
  since: string | null;
  checkedAt: string | null;
  responseMs: number | null;
  /** Game servers: players / users online and slots of the latest check (null when unknown or down). */
  usersOnline: number | null;
  usersMax: number | null;
  /** Share of checks with an answer that was not "down", in percent (null without checks). */
  uptime24h: number | null;
  uptime90d: number | null;
  /** Average response time over the last 24 hours. */
  avgResponseMs24h: number | null;
  hours: Bucket[];
  days: Bucket[];
};

export type StatusOverview = {
  /** Worst state of the services that count ({@link overallState}). */
  status: DisplayState;
  /** Time of the newest check of any service (ISO), null without any. */
  updatedAt: string | null;
  generatedAt: string;
  /** No check for {@link STALE_AFTER_MS}: the platform worker is probably not running. */
  stale: boolean;
  /** False when the database could not be read (nothing cached either). */
  available: boolean;
  notice: string | null;
  services: ServiceStatus[];
};

const SEVERITY: Record<ServiceState | "unknown", number> = { up: 0, unknown: 1, degraded: 2, down: 3 };

/**
 * Overall status: the worst state among the services that count (`inOverall`). Without any: "maintenance" when a
 * service is in maintenance, else "unknown".
 */
export function overallState(services: Pick<ServiceStatus, "checkState" | "inOverall" | "maintenance">[]): DisplayState {
  const counted = services.filter((s) => s.inOverall);
  if (!counted.length) return services.some((s) => s.maintenance) ? "maintenance" : "unknown";
  return counted.reduce<ServiceState | "unknown">((worst, s) => (SEVERITY[s.checkState] > SEVERITY[worst] ? s.checkState : worst), "up");
}

/** The configuration part of a service row (state, maintenance, overall) at `now`. */
function displayFields(target: StatusTarget, checkState: ServiceState | "unknown", now: Date) {
  const maintenance = maintenanceActive(target.maintenance, now) ? target.maintenance : null;
  return {
    state: (maintenance ? "maintenance" : checkState) as DisplayState,
    checkState,
    maintenance,
    inOverall: !maintenance && !target.excludeFromOverall,
  };
}

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: STATUS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day (Europe/Berlin) of an instant, `YYYY-MM-DD`. */
export function berlinDay(date: Date): string {
  return dayFormat.format(date);
}

/** The last `count` calendar days ending with `today` (`YYYY-MM-DD`), oldest first. */
export function lastDays(today: string, count: number): string[] {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d - (count - 1 - i))).toISOString().slice(0, 10));
}

/** Starts of the last `count` hours including the current one, oldest first. */
export function lastHours(now: Date, count: number): Date[] {
  const current = Math.floor(now.getTime() / 3600_000) * 3600_000;
  return Array.from({ length: count }, (_, i) => new Date(current - (count - 1 - i) * 3600_000));
}

function uptime(buckets: Bucket[]): number | null {
  const checks = buckets.reduce((n, b) => n + b.checks, 0);
  if (!checks) return null;
  const down = buckets.reduce((n, b) => n + b.down, 0);
  return Math.floor(((checks - down) / checks) * 10_000) / 100;
}

function notice(): string | null {
  const value = process.env.TRETU_STATUS_NOTICE?.trim();
  return value ? value.slice(0, 500) : null;
}

/** Builds the overview from the database (no cache). */
export async function loadStatusOverview(db: Executor, now: Date = new Date(), targets: StatusTarget[] = statusTargets()): Promise<StatusOverview> {
  const ids = targets.map((t) => t.id);
  const hourStarts = lastHours(now, HOURS);
  const days = lastDays(berlinDay(now), DAYS);
  const empty: StatusOverview = {
    status: "unknown",
    updatedAt: null,
    generatedAt: now.toISOString(),
    stale: false,
    available: true,
    notice: notice(),
    services: [],
  };
  if (!ids.length) return empty;

  // The oldest daily bucket starts at midnight in Berlin, at most 2 h before UTC midnight of that date.
  const since = new Date(Date.parse(`${days[0]}T00:00:00Z`) - 3 * 3600_000);
  const [services, rollups] = await Promise.all([
    db.select().from(platformStatusServices).where(inArray(platformStatusServices.service, ids)),
    db
      .select()
      .from(platformStatusRollups)
      .where(and(inArray(platformStatusRollups.service, ids), gte(platformStatusRollups.bucketStart, since))),
  ]);

  const byService = new Map(services.map((s) => [s.service, s]));
  const hourly = new Map<string, (typeof rollups)[number]>();
  const daily = new Map<string, (typeof rollups)[number]>();
  for (const row of rollups) {
    if (row.period === "hour") hourly.set(`${row.service}|${row.bucketStart.getTime()}`, row);
    else if (row.period === "day") daily.set(`${row.service}|${berlinDay(row.bucketStart)}`, row);
  }
  const bucket = (start: string, row: (typeof rollups)[number] | undefined): Bucket => ({
    start,
    checks: row?.checks ?? 0,
    up: row?.up ?? 0,
    degraded: row?.degraded ?? 0,
    down: row?.down ?? 0,
  });

  let newest = 0;
  const list: ServiceStatus[] = targets.map((target) => {
    const row = byService.get(target.id);
    if (row) newest = Math.max(newest, row.lastCheckedAt.getTime());
    const hourRows = hourStarts.map((h) => hourly.get(`${target.id}|${h.getTime()}`));
    const hours = hourStarts.map((h, i) => bucket(h.toISOString(), hourRows[i]));
    const dayBuckets = days.map((d) => bucket(d, daily.get(`${target.id}|${d}`)));
    const answered = hourRows.reduce((n, r) => n + (r?.responseCount ?? 0), 0);
    const totalMs = hourRows.reduce((n, r) => n + (r?.responseMsSum ?? 0), 0);
    return {
      id: target.id,
      kind: target.kind,
      name: target.name,
      host: target.host,
      ...displayFields(target, (row?.state as ServiceState | undefined) ?? "unknown", now),
      since: row?.since.toISOString() ?? null,
      checkedAt: row?.lastCheckedAt.toISOString() ?? null,
      responseMs: row?.lastResponseMs ?? null,
      usersOnline: row?.usersOnline ?? null,
      usersMax: row?.usersMax ?? null,
      uptime24h: uptime(hours),
      uptime90d: uptime(dayBuckets),
      avgResponseMs24h: answered ? Math.round(totalMs / answered) : null,
      hours,
      days: dayBuckets,
    };
  });

  return {
    ...empty,
    status: overallState(list),
    updatedAt: newest ? new Date(newest).toISOString() : null,
    stale: newest ? now.getTime() - newest > STALE_AFTER_MS : true,
    services: list,
  };
}

type Cache = { at: number; key: string; value: StatusOverview };
const globalCache = globalThis as unknown as { __tretuStatusCache?: Cache };

/** The overview for the page and `/api/status`: cached {@link CACHE_MS}, last good value on database errors. */
export async function getStatusOverview(now: Date = new Date()): Promise<StatusOverview> {
  const targets = statusTargets();
  const key = JSON.stringify([
    targets.map((t) => [t.id, t.kind, t.name, t.host, t.excludeFromOverall, t.maintenance]),
    process.env.TRETU_STATUS_NOTICE ?? "",
  ]);
  const cached = globalCache.__tretuStatusCache;
  if (cached && cached.key === key && now.getTime() - cached.at < CACHE_MS) return cached.value;
  const unavailable = (): StatusOverview => ({
    status: "unknown",
    updatedAt: null,
    generatedAt: now.toISOString(),
    stale: true,
    available: false,
    notice: notice(),
    services: targets.map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      host: t.host,
      ...displayFields(t, "unknown", now),
      since: null,
      checkedAt: null,
      responseMs: null,
      usersOnline: null,
      usersMax: null,
      uptime24h: null,
      uptime90d: null,
      avgResponseMs24h: null,
      hours: [],
      days: [],
    })),
  });
  if (!isPlatformDbConfigured()) return unavailable();
  try {
    const value = await loadStatusOverview(getPlatformDb(), now, targets);
    globalCache.__tretuStatusCache = { at: now.getTime(), key, value };
    return value;
  } catch (error) {
    log("error", "status.read_failed", { error: error instanceof Error ? error.message : String(error) });
    if (cached && cached.key === key) {
      // Recheck staleness against the current time; the rest is the last good answer.
      const updated = cached.value.updatedAt ? Date.parse(cached.value.updatedAt) : 0;
      return { ...cached.value, stale: !updated || now.getTime() - updated > STALE_AFTER_MS };
    }
    return unavailable();
  }
}

/** Test hook. */
export function clearStatusCache(): void {
  globalCache.__tretuStatusCache = undefined;
}
