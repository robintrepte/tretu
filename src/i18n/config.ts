/** Supported UI languages. German is the default and the authoritative language. */
export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

/** Cookie holding the UI language (shared convention of all Tretu Next.js apps). */
export const LOCALE_COOKIE = "NEXT_LOCALE";
/** Set by the language switcher: the visitor chose a language here, so login claims do not override it. */
export const LOCALE_MANUAL_COOKIE = "NEXT_LOCALE_MANUAL";
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** BCP 47 tags for `Intl` formatting. */
export const INTL_LOCALE: Record<Locale, string> = { de: "de-DE", en: "en-GB" };
