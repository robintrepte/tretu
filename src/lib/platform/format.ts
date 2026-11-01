/** Date/number formatting shared by platform pages (server and client). */
import type { PlatformLocale, Translator } from "@/lib/platform/i18n-core";

const intl = (locale: PlatformLocale) => (locale === "en" ? "en-GB" : "de-DE");

export function formatDate(locale: PlatformLocale, iso: string | Date): string {
  return new Intl.DateTimeFormat(intl(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(
    typeof iso === "string" ? new Date(iso) : iso
  );
}

export function formatDateTime(locale: PlatformLocale, iso: string | Date): string {
  return new Intl.DateTimeFormat(intl(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatNumber(locale: PlatformLocale, value: number): string {
  return new Intl.NumberFormat(intl(locale)).format(value);
}

/** "vor 5 Minuten" etc. (common.* keys), falling back to the date after a week. */
export function relativeTime(t: Translator, locale: PlatformLocale, iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("common.justNow");
  if (minutes < 60) return t("common.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("common.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("common.daysAgo", { n: days });
  return formatDate(locale, iso);
}

/** "Mein Konto" on auth.tretu.de (contract §2). */
export function accountUrl(): string {
  const issuer = (process.env.TRETU_AUTH_ISSUER || "https://auth.tretu.de").replace(/\/+$/, "");
  return `${issuer}/konto`;
}
