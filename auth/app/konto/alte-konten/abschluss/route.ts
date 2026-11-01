import { eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"
import { CLAIM_COOKIE, readClaim } from "@/lib/account"
import { audit, requestIp } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { session as sessionTable } from "@/lib/db/schema"
import { env, issuer } from "@/lib/env"
import { claimWithSession } from "@/lib/legacy/claim"

export const dynamic = "force-dynamic"

/**
 * End of "prove with Discord/Google": the provider sign-in just signed the browser in as the account that
 * owns that identity. If it is an unused imported account, it is merged into the account that started the
 * claim. Either way that proof session ends here and the user signs in again.
 */
export async function GET() {
  const store = await cookies()
  const targetUserId = readClaim(store.get(CLAIM_COOKIE)?.value)
  store.delete(CLAIM_COOKIE)
  const requestHeaders = await headers()
  const current = await auth.api.getSession({ headers: requestHeaders })
  const meta = { ipAddress: requestIp(requestHeaders), userAgent: requestHeaders.get("user-agent") }

  if (!targetUserId || !current) return NextResponse.redirect(new URL("/konto?tab=alte-konten&claim=oauthFailed", issuer))
  if (current.user.id === targetUserId) {
    // The identity was free and is now simply linked to the right account.
    return NextResponse.redirect(new URL("/konto?tab=konten", issuer))
  }

  const result = await claimWithSession(db, { targetUserId, currentUserId: current.user.id, claimDays: env.LEGACY_CLAIM_DAYS })
  await audit(result.ok ? "legacy.claimed" : "legacy.claim_failed", {
    userId: targetUserId,
    success: result.ok,
    ...meta,
    meta: result.ok ? { method: "oauth" } : { method: "oauth", reason: result.error },
  })
  if (!result.ok) await db.delete(sessionTable).where(eq(sessionTable.id, current.session.id))
  for (const cookie of store.getAll()) if (cookie.name.includes("tretu.session")) store.delete(cookie.name)
  const target = result.ok ? "/login?claimed=1" : `/login?error=claim_${result.error}`
  return NextResponse.redirect(new URL(target, issuer), 303)
}
