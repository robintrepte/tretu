import { cookies, headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import de from "@/messages/de.json"
import en from "@/messages/en.json"
import { localeFromHeaders } from "./locales"

export const messages = { de, en }

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const locale = localeFromHeaders(cookieStore.toString(), headerStore.get("accept-language"))
  return { locale, messages: messages[locale], timeZone: "Europe/Berlin" }
})
