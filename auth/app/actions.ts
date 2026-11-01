"use server"

import { eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { isLocale, LOCALE_COOKIE } from "@/i18n/locales"
import { audit } from "@/lib/audit"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { isHttps } from "@/lib/env"
import { getSession } from "@/lib/session"
import { emitUserEvent } from "@/lib/tretu/events"

/** Switches the UI language; for signed-in users it is also saved (→ `locale` claim, user.updated event). */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return { ok: false as const }
  ;(await cookies()).set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", secure: isHttps })
  const session = await getSession()
  if (session) {
    const [updated] = await db
      .update(user)
      .set({ locale })
      .where(eq(user.id, session.user.id))
      .returning({ id: user.id })
    if (updated) {
      await audit("locale.changed", { userId: session.user.id, meta: { locale } })
      await emitUserEvent("user.updated", session.user.id)
    }
  }
  return { ok: true as const }
}
