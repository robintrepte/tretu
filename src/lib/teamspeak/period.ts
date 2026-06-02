const TZ = "Europe/Berlin";

function berlinYmd(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? 1970),
    month: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

/** ISO week key from a calendar date, e.g. `2026-W23`. */
export function isoWeekKeyFromYmd(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Current calendar week in Europe/Berlin, e.g. `2026-W23`. */
export function currentWeekKey(date = new Date()): string {
  const { year, month, day } = berlinYmd(date);
  return isoWeekKeyFromYmd(year, month, day);
}

/** Current calendar year in Europe/Berlin, e.g. `2026`. */
export function currentYearKey(date = new Date()): string {
  const { year } = berlinYmd(date);
  return String(year);
}

/** Current month bucket key, e.g. `2026-06`. */
export function currentPeriodKey(date = new Date()): string {
  const { year, month } = berlinYmd(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const TS_RANK_TIMEZONE = TZ;

/** Active within last 30 days (matches old top_month.php). */
export const MONTHLY_ACTIVE_WINDOW_SEC = 30 * 24 * 60 * 60;

/** Active within last 7 days for weekly leaderboard. */
export const WEEKLY_ACTIVE_WINDOW_SEC = 7 * 24 * 60 * 60;
