"use client";

import { createContext, useContext, useMemo } from "react";

import { createTranslator, type PlatformLocale, type Translator } from "@/lib/platform/i18n-core";

const LocaleContext = createContext<PlatformLocale>("de");

export function PlatformI18nProvider({ locale, children }: { locale: PlatformLocale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): PlatformLocale {
  return useContext(LocaleContext);
}

/** Client-side translator (same messages and formatter as the server). */
export function useT(namespace?: string): Translator {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale, namespace), [locale, namespace]);
}
