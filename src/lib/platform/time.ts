/** Europe/Berlin calendar helpers (daily top-up, daily caps). */
export const PLATFORM_TIME_ZONE = "Europe/Berlin";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLATFORM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` of the Europe/Berlin calendar day containing `date` (DST-safe). */
export function berlinDay(date: Date = new Date()): string {
  return dayFormatter.format(date);
}
