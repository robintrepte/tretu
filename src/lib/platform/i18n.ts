/**
 * Server-side i18n for platform pages. Locale from the `NEXT_LOCALE` cookie (default `de`).
 * TODO(integration): can switch to next-intl's getTranslations() — the JSON shape is compatible.
 */
import { cookies } from "next/headers";

import { createTranslator, normalizeLocale, type PlatformLocale, type Translator } from "@/lib/platform/i18n-core";

export async function getPlatformLocale(): Promise<PlatformLocale> {
  try {
    const store = await cookies();
    return normalizeLocale(store.get("NEXT_LOCALE")?.value);
  } catch {
    return "de";
  }
}

export async function getTranslations(namespace?: string): Promise<{ t: Translator; locale: PlatformLocale }> {
  const locale = await getPlatformLocale();
  return { t: createTranslator(locale, namespace), locale };
}
