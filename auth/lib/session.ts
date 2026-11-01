import "server-only"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }))

/** The signed-in user's full row, or a redirect to the login page. */
export const requireUser = cache(async () => {
  const session = await getSession()
  if (!session) redirect("/login")
  const row = await db.query.user.findFirst({ where: eq(user.id, session.user.id) })
  if (!row) redirect("/login")
  return { session, user: row }
})
