export const locales = ["de", "en"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "de"
export const LOCALE_COOKIE = "NEXT_LOCALE"
export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale)
export const localeNames: Record<Locale, string> = { de: "Deutsch", en: "English" }

/** The language of a request: the NEXT_LOCALE cookie, else the browser's preference, else German. */
export function localeFromHeaders(cookieHeader: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  const cookie = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))?.[1]
  if (isLocale(cookie)) return cookie
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.split(";")[0]?.trim().slice(0, 2).toLowerCase()
    if (isLocale(code)) return code
  }
  return defaultLocale
}
