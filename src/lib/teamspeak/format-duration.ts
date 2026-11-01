const UNITS = {
  de: { day: "Tag", days: "Tage", hours: "Std.", minutes: "Min.", seconds: "Sek." },
  en: { day: "day", days: "days", hours: "h", minutes: "min", seconds: "s" },
} as const;

/** Duration like the old ranksystem ("3 Tage, 4 Std." / "3 days, 4 h"). */
export function formatDuration(totalSeconds: number, locale: string = "de"): string {
  const u = locale === "en" ? UNITS.en : UNITS.de;
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? u.day : u.days}`);
  if (hours > 0) parts.push(`${hours} ${u.hours}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} ${u.minutes}`);
  if (parts.length === 0) parts.push(`${secs} ${u.seconds}`);

  return parts.join(", ");
}

/** German-friendly duration (aligned with old ranksystem date format). */
export function formatDurationGerman(totalSeconds: number): string {
  return formatDuration(totalSeconds, "de");
}
