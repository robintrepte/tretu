import { and, eq, inArray } from "drizzle-orm"
import { db as defaultDb, type Db } from "@/lib/db"
import { account, externalLink, user } from "@/lib/db/schema"
import { normalizeLocale, type ClaimSource, type UserLinks } from "@/lib/oidc/claims"

/** The user shape of contract §2 (admin API, events). */
export interface UserShape {
  sub: string
  username: string | null
  name: string
  picture: string | null
  locale: "de" | "en"
  roles: string[]
  links: UserLinks
  createdAt: string
}

export async function getUserLinks(userId: string, db: Db = defaultDb): Promise<UserLinks> {
  const [discord] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
    .limit(1)
  const external = await db
    .select({ provider: externalLink.provider, id: externalLink.providerAccountId, displayName: externalLink.displayName })
    .from(externalLink)
    .where(eq(externalLink.userId, userId))
  const links: UserLinks = {}
  if (discord) links.discord = discord.accountId
  for (const link of external) {
    if (link.provider === "minecraft") {
      links.minecraft = link.id
      if (link.displayName) links.minecraftName = link.displayName
    } else if (link.provider === "steam") {
      links.steam = link.id
    }
  }
  return links
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
