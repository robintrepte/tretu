/**
 * KPIs and time series for the central admin's "Übersicht": Tretu-Konten (auth stats endpoint) plus what the
 * platform itself records (events, presence, apps used, wallet, badges). Days are Europe/Berlin days.
 */
import { sql } from "drizzle-orm";

import { authAdmin, AuthAdminError, type AdminStats } from "@/lib/admin/auth-admin";
import { creditsPerDay, lastDays, type WalletDay } from "@/lib/admin/wallet-admin";
import { platformDb, type Executor } from "@/lib/platform/db";
import { NON_USAGE_APPS } from "@/lib/platform/events";

export type AppActivity = {
  app: string;
  /** Distinct users with at least one event that day. */
  daily: { day: string; users: number }[];
  /** Distinct users in the last 7 days. */
  weekly: number;
  /** Users who ever used the app (platform_user_apps). */
  total: number;
  /** Presence entries that have not expired. */
  onlineNow: number;
};

export type PlatformKpis = {
  directoryUsers: number;
  apps: AppActivity[];
  credits: WalletDay[];
  badgesPerDay: { day: string; count: number }[];
  badgesTotal: number;
};

const DAY_SQL = (column: string) => sql.raw(`to_char(${column} at time zone 'Europe/Berlin', 'YYYY-MM-DD')`);
type Row = Record<string, string | number | null>;

export async function platformKpis(db: Executor = platformDb, now: Date = new Date(), days = 30): Promise<PlatformKpis> {
  const range = lastDays(days, now);
  const since = new Date(now.getTime() - (days + 1) * 24 * 3600_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const excluded = [...NON_USAGE_APPS];
  const notExcluded = sql`app not in (${sql.join(excluded.map((a) => sql`${a}`), sql`, `)})`;

  const [dailyRows, weeklyRows, totalRows, onlineRows, [directory], credits, badgeRows, [badgeTotal]] = await Promise.all([
    db.execute(sql`
      select app, ${DAY_SQL("occurred_at")} as day, count(distinct sub)::int as users
      from platform_events
      where sub is not null and occurred_at >= ${since}::timestamptz and occurred_at <= ${now.toISOString()}::timestamptz and ${notExcluded}
      group by 1, 2`) as unknown as Promise<Row[]>,
    db.execute(sql`
      select app, count(distinct sub)::int as users from platform_events
      where sub is not null and occurred_at >= ${weekAgo}::timestamptz and occurred_at <= ${now.toISOString()}::timestamptz and ${notExcluded}
      group by 1`) as unknown as Promise<Row[]>,
    db.execute(sql`select app, count(*)::int as users from platform_user_apps group by 1`) as unknown as Promise<Row[]>,
    db.execute(sql`
      select app, count(distinct sub)::int as users from platform_presence where expires_at > ${now.toISOString()}::timestamptz group by 1`) as unknown as Promise<Row[]>,
    db.execute(sql`select count(*)::int as n from platform_users`) as unknown as Promise<Row[]>,
    creditsPerDay(db, days, now),
    db.execute(sql`
      select ${DAY_SQL("earned_at")} as day, count(*)::int as count from platform_user_badges
      where earned_at >= ${since}::timestamptz group by 1`) as unknown as Promise<Row[]>,
    db.execute(sql`select count(*)::int as n from platform_user_badges`) as unknown as Promise<Row[]>,
  ]);

  const apps = new Set<string>(["saga", "play", "hollowmere", "mc-dashboard"]);
  for (const r of [...dailyRows, ...weeklyRows, ...totalRows, ...onlineRows]) if (typeof r.app === "string" && !NON_USAGE_APPS.has(r.app)) apps.add(r.app);
  const pick = (rows: Row[], app: string) => Number(rows.find((r) => r.app === app)?.users ?? 0);

  const badgeByDay = new Map(badgeRows.map((r) => [String(r.day), Number(r.count)]));
  return {
    directoryUsers: Number(directory?.n ?? 0),
    apps: [...apps].map((app) => ({
      app,
      daily: range.map((day) => ({ day, users: Number(dailyRows.find((r) => r.app === app && r.day === day)?.users ?? 0) })),
      weekly: pick(weeklyRows, app),
      total: pick(totalRows, app),
      onlineNow: pick(onlineRows, app),
    })),
    credits,
    badgesPerDay: range.map((day) => ({ day, count: badgeByDay.get(day) ?? 0 })),
    badgesTotal: Number(badgeTotal?.n ?? 0),
  };
}

export type AccountKpis = { ok: true; stats: AdminStats } | { ok: false; error: AuthAdminError["code"] };

/** Tretu-Konten numbers from auth; a friendly error code when auth is down or not configured. */
export async function accountKpis(): Promise<AccountKpis> {
  try {
    return { ok: true, stats: await authAdmin.stats() };
  } catch (error) {
    if (error instanceof AuthAdminError) return { ok: false, error: error.code };
    throw error;
  }
}
