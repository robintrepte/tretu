import { getLocale } from "next-intl/server";

import { INTL_LOCALE, resolveLocale, type Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/dashboard/format";

/** Server-side formatters for the admin pages, bound to the request's UI language. */
export async function adminFormat() {
  const locale: Locale = resolveLocale(await getLocale());
  const intl = INTL_LOCALE[locale];
  return {
    locale,
    dateTime: (iso: string | null | undefined) => formatDateTime(iso, intl),
    date: (iso: string | null | undefined) =>
      iso ? new Date(iso).toLocaleDateString(intl, { dateStyle: "medium", timeZone: "Europe/Berlin" }) : "–",
    number: (value: number) => value.toLocaleString(intl),
    signed: (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString(intl)}`,
  };
}

/** Admin action key as used in the messages (`account.lock` → `account_lock`). */
export const actionMessageKey = (action: string) => action.replace(/\./g, "_");
