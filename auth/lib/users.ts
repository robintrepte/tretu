import { and, eq, inArray } from "drizzle-orm"
import { db as defaultDb, type Db } from "@/lib/db"
import { account, externalLink, user } from "@/lib/db/schema"
import { normalizeLocale, type ClaimSource, type UserLinks } from "@/lib/oidc/claims"

/** Whether an admin lock is in force at `now` (a lock whose `lockedUntil` has passed is not, even before it is lifted). */
export function isLockActive(row: { locked: boolean; lockedUntil: Date | null } | null | undefined, now: Date = new Date()): boolean {
  return Boolean(row?.locked && (!row.lockedUntil || row.lockedUntil.getTime() > now.getTime()))
}

/** The user shape of contract §2 (admin API, events). */
export interface UserShape {
  sub: string
  username: string | null
  name: string
  picture: string | null
  locale: "de" | "en"
  roles: string[]
  /** Locked by an admin (lib/admin/lock.ts): apps end the user's sessions and refuse new ones until unlocked. */
  locked: boolean
  links: UserLinks
  createdAt: string
}

/**
 * The linked accounts of contract §2: Discord and Steam are sign-in identities (`account` rows), Minecraft and
 * TeamSpeak are linked by other Tretu services through the admin API (`external_link`).
 */
export async function getUserLinks(userId: string, db: Db = defaultDb): Promise<UserLinks> {
  return (await getUserLinksMany([userId], db)).get(userId) ?? {}
}

/** The links of several users in two queries (admin user list). */
export async function getUserLinksMany(userIds: string[], db: Db = defaultDb): Promise<Map<string, UserLinks>> {
  const result = new Map<string, UserLinks>(userIds.map((id) => [id, {}]))
  if (!userIds.length) return result
  const [identities, external] = await Promise.all([
    db
      .select({ userId: account.userId, providerId: account.providerId, accountId: account.accountId })
      .from(account)
      .where(and(inArray(account.userId, userIds), inArray(account.providerId, ["discord", "steam"]))),
    db
      .select({ userId: externalLink.userId, provider: externalLink.provider, id: externalLink.providerAccountId, displayName: externalLink.displayName })
      .from(externalLink)
      .where(and(inArray(externalLink.userId, userIds), inArray(externalLink.provider, ["minecraft", "teamspeak"]))),
  ])
  for (const identity of identities) {
    const links = result.get(identity.userId)!
    if (identity.providerId === "discord") links.discord = identity.accountId
    else if (identity.providerId === "steam") links.steam = identity.accountId
  }
  for (const link of external) {
    const links = result.get(link.userId)!
    if (link.provider === "minecraft") {
      links.minecraft = link.id
      if (link.displayName) links.minecraftName = link.displayName
    } else if (link.provider === "teamspeak") {
      links.teamspeak = link.id
      if (link.displayName) links.teamspeakName = link.displayName
    }
  }
  return result
}

export async function getClaimSource(userId: string, db: Db = defaultDb): Promise<ClaimSource | null> {
  const row = await db.query.user.findFirst({ where: eq(user.id, userId) })
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    username: row.username,
    displayUsername: row.displayUsername,
    locale: row.locale,
    roles: row.roles,
  }
}

export async function getUserShape(userId: string, db: Db = defaultDb): Promise<UserShape | null> {
  const row = await db.query.user.findFirst({ where: eq(user.id, userId) })
  if (!row) return null
  return {
    sub: row.id,
    username: row.displayUsername || row.username,
    name: row.name,
    picture: row.image,
    locale: normalizeLocale(row.locale),
    roles: row.roles,
    locked: isLockActive(row),
    links: await getUserLinks(row.id, db),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function findUserIdByUsername(username: string, db: Db = defaultDb): Promise<string | null> {
  const row = await db.query.user.findFirst({ where: eq(user.username, username.trim().toLowerCase()), columns: { id: true } })
  return row?.id ?? null
}

export async function usersExist(ids: string[], db: Db = defaultDb): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await db.select({ id: user.id }).from(user).where(inArray(user.id, ids))
  return new Set(rows.map((r) => r.id))
}

export const isAdmin = (roles: readonly string[] | null | undefined) => Boolean(roles?.includes("admin"))
