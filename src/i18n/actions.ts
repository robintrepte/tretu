"use server";

import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_MANUAL_COOKIE } from "@/i18n/config";

/** Language switcher: stores the choice and marks it as chosen here (login claims no longer override it). */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  const options = {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  store.set(LOCALE_COOKIE, locale, options);
  store.set(LOCALE_MANUAL_COOKIE, "1", { ...options, httpOnly: true });
}
