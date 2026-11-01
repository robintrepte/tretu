/** Client-safe formatting helpers for the dashboard (`intlLocale` e.g. "de-DE" or "en-GB"). */

export function formatBytes(bytes: number | null | undefined, intlLocale = "de-DE"): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString(intlLocale, { maximumFractionDigits: value < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

export function formatEuro(value: number | null | undefined, digits = 2, intlLocale = "de-DE"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toLocaleString(intlLocale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, 4),
  });
}

export function formatDateTime(iso: string | null | undefined, intlLocale = "de-DE"): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString(intlLocale, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
}

export function formatRelative(iso: string | null | undefined, now = Date.now(), intlLocale = "de-DE"): string {
  if (!iso) return "–";
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

const DURATION_UNITS: Record<string, { h: string; min: string }> = {
  de: { h: "Std.", min: "Min." },
  en: { h: "h", min: "min" },
};

export function formatDuration(ms: number, intlLocale = "de-DE"): string {
  const u = DURATION_UNITS[intlLocale.slice(0, 2)] ?? DURATION_UNITS.de;
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} ${u.min}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ${u.h} ${m} ${u.min}` : `${h} ${u.h}`;
}
