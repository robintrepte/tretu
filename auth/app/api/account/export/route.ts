import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { audit, requestIp } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { getUserShape } from "@/lib/users"

export const dynamic = "force-dynamic"

/** "Meine Daten herunterladen": everything stored about the signed-in user, without secrets. */
export async function GET() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 })
  const userId = session.user.id
  const row = await db.query.user.findFirst({ where: eq(s.user.id, userId) })
  if (!row) return Response.json({ error: "unauthorized" }, { status: 401 })

  const [accounts, links, passkeys, sessions, consents, legacy, activity] = await Promise.all([
    db.select({ provider: s.account.providerId, accountId: s.account.accountId, createdAt: s.account.createdAt }).from(s.account).where(eq(s.account.userId, userId)),
    db.select({ provider: s.externalLink.provider, accountId: s.externalLink.providerAccountId, displayName: s.externalLink.displayName, createdAt: s.externalLink.createdAt }).from(s.externalLink).where(eq(s.externalLink.userId, userId)),
    db.select({ name: s.passkey.name, deviceType: s.passkey.deviceType, backedUp: s.passkey.backedUp, createdAt: s.passkey.createdAt }).from(s.passkey).where(eq(s.passkey.userId, userId)),
    db.select({ createdAt: s.session.createdAt, expiresAt: s.session.expiresAt, ipAddress: s.session.ipAddress, userAgent: s.session.userAgent }).from(s.session).where(eq(s.session.userId, userId)),
    db.select({ clientId: s.oauthConsent.clientId, scopes: s.oauthConsent.scopes, createdAt: s.oauthConsent.createdAt }).from(s.oauthConsent).where(eq(s.oauthConsent.userId, userId)),
    db.select({ app: s.legacyLink.app, legacyUserId: s.legacyLink.legacyUserId, legacyUsername: s.legacyLink.legacyUsername, legacyEmail: s.legacyLink.legacyEmail, method: s.legacyLink.method, importedAt: s.legacyLink.importedAt }).from(s.legacyLink).where(eq(s.legacyLink.userId, userId)),
    db.select({ event: s.auditLog.event, success: s.auditLog.success, ipAddress: s.auditLog.ipAddress, userAgent: s.auditLog.userAgent, meta: s.auditLog.meta, createdAt: s.auditLog.createdAt }).from(s.auditLog).where(eq(s.auditLog.userId, userId)).orderBy(desc(s.auditLog.createdAt)),
  ])
  const apps = await db
    .selectDistinct({ clientId: s.oauthRefreshToken.clientId })
    .from(s.oauthRefreshToken)
    .where(eq(s.oauthRefreshToken.userId, userId))

  const data = {
    exportedAt: new Date().toISOString(),
    profile: {
      ...(await getUserShape(userId)),
      email: row.email,
      emailVerified: row.emailVerified,
      twoFactorEnabled: Boolean(row.twoFactorEnabled),
      lastLoginAt: row.lastLoginAt,
      updatedAt: row.updatedAt,
    },
    signInMethods: accounts.map((a) => (a.provider === "credential" ? { provider: "password", createdAt: a.createdAt } : a)),
    gameAccounts: links,
    passkeys,
    sessions,
    appsWithAccess: [...new Set([...consents.map((c) => c.clientId), ...apps.map((a) => a.clientId)])],
    consents,
    legacyAccounts: legacy,
    activity,
  }
  await audit("data.exported", { userId, ipAddress: requestIp(requestHeaders), userAgent: requestHeaders.get("user-agent") })
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="tretu-konto-${row.username ?? userId}.json"`,
      "cache-control": "no-store",
    },
  })
}
