import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

/** No URL prefixes: the language comes from the `NEXT_LOCALE` cookie (default German). */
export default getRequestConfig(async () => {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    messages: loadMessages(locale),
    timeZone: "Europe/Berlin",
  };
});
