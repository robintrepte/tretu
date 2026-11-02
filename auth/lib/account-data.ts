import "server-only"
import { and, desc, eq, gte, inArray } from "drizzle-orm"
import { RENAME_INTERVAL_DAYS } from "@/lib/account"
import { db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { isAdmin } from "@/lib/users"

/** Everything the account page shows, loaded in one go. */
export async function loadAccountData(user: typeof s.user.$inferSelect, withActivity: boolean) {
  const now = Date.now()
  const [accounts, gameLinks, passkeys, activity] = await Promise.all([
    db
      .select({ id: s.account.id, providerId: s.account.providerId, accountId: s.account.accountId, displayName: s.account.displayName })
      .from(s.account)
      .where(eq(s.account.userId, user.id)),
    db
      .select({ provider: s.externalLink.provider, id: s.externalLink.providerAccountId, displayName: s.externalLink.displayName })
      .from(s.externalLink)
      .where(and(eq(s.externalLink.userId, user.id), inArray(s.externalLink.provider, ["minecraft", "teamspeak"]))),
    db.select({ id: s.passkey.id, name: s.passkey.name, createdAt: s.passkey.createdAt }).from(s.passkey).where(eq(s.passkey.userId, user.id)),
    withActivity
      ? db
          .select({
            id: s.auditLog.id,
            event: s.auditLog.event,
            success: s.auditLog.success,
            ipAddress: s.auditLog.ipAddress,
            userAgent: s.auditLog.userAgent,
            meta: s.auditLog.meta,
            createdAt: s.auditLog.createdAt,
          })
          .from(s.auditLog)
          .where(and(eq(s.auditLog.userId, user.id), gte(s.auditLog.createdAt, new Date(now - 90 * 86_400_000))))
          .orderBy(desc(s.auditLog.createdAt))
          .limit(40)
      : Promise.resolve([]),
  ])
  const renameAt =
    !user.usernamePending && user.usernameChangedAt ? new Date(user.usernameChangedAt.getTime() + RENAME_INTERVAL_DAYS * 86_400_000) : null
  return {
    accounts,
    gameLinks,
    passkeys,
    activity,
    hasPassword: accounts.some((a) => a.providerId === "credential"),
    /** Linked sign-in providers: the account row id (for unlinking), the provider's id and name. */
    providers: Object.fromEntries(
      accounts.filter((a) => a.providerId !== "credential").map((a) => [a.providerId, { id: a.id, accountId: a.accountId, displayName: a.displayName }]),
    ) as Record<string, { id: string; accountId: string; displayName: string | null }>,
    admin: isAdmin(user.roles),
    renameAt: renameAt && renameAt.getTime() > now ? renameAt.toISOString() : null,
  }
}
