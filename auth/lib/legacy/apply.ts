import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import type { Db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { emitUserEvent } from "@/lib/tretu/events"
import type { Anchor, IdentityProvider, LegacyApp, PlannedGroup } from "./plan"

/** Every existing Tretu account, as anchors for the matching (identities, verified email, earlier imports). */
export async function loadAnchors(db: Db): Promise<{ anchors: Anchor[] }> {
  const users = await db
    .select({ id: s.user.id, email: s.user.email, emailVerified: s.user.emailVerified, username: s.user.username })
    .from(s.user)
  const accounts = await db.select({ userId: s.account.userId, providerId: s.account.providerId, accountId: s.account.accountId }).from(s.account)
  const links = await db.select({ userId: s.legacyLink.userId, app: s.legacyLink.app, legacyUserId: s.legacyLink.legacyUserId }).from(s.legacyLink)
  const byUser = new Map<string, Anchor>()
  for (const u of users) {
    byUser.set(u.id, {
      userId: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      username: u.username,
      identities: [],
      legacy: [],
      hasPassword: false,
    })
  }
  for (const a of accounts) {
    const anchor = byUser.get(a.userId)
    if (!anchor) continue
    if (a.providerId === "credential") anchor.hasPassword = true
    else if (a.providerId === "discord" || a.providerId === "google" || a.providerId === "apple" || a.providerId === "steam") anchor.identities.push({ provider: a.providerId as IdentityProvider, id: a.accountId })
  }
  for (const l of links) byUser.get(l.userId)?.legacy.push({ app: l.app as LegacyApp, legacyUserId: l.legacyUserId })
  return { anchors: [...byUser.values()] }
}

/** Writes one planned group (one transaction). Returns the Tretu ID and whether it is a new account. */
export async function applyGroup(db: Db, group: PlannedGroup, now = new Date()): Promise<{ userId: string; created: boolean }> {
  const userId = group.anchorUserId ?? group.newUserId!
  const created = !group.anchorUserId
  await db.transaction(async (tx) => {
    if (created) {
      await tx.insert(s.user).values({
        id: userId,
        name: group.name,
        email: group.email,
        emailVerified: group.emailVerified,
        image: group.image,
        username: group.username.toLowerCase(),
        displayUsername: group.username,
        usernamePending: group.usernamePending,
        locale: "de",
        roles: [],
        createdAt: group.createdAt,
        updatedAt: now,
      })
    }
    for (const identity of group.identities) {
      const exists = await tx.query.account.findFirst({
        where: and(eq(s.account.providerId, identity.provider), eq(s.account.accountId, identity.id)),
        columns: { id: true },
      })
      if (!exists) await tx.insert(s.account).values({ id: randomUUID(), userId, providerId: identity.provider, accountId: identity.id, createdAt: now, updatedAt: now })
    }
    if (group.passwordHash) {
      const credential = await tx.query.account.findFirst({ where: and(eq(s.account.userId, userId), eq(s.account.providerId, "credential")), columns: { id: true } })
      if (!credential) await tx.insert(s.account).values({ id: randomUUID(), userId, providerId: "credential", accountId: userId, password: group.passwordHash, createdAt: now, updatedAt: now })
    }
    for (const record of group.newRecords) {
      await tx
        .insert(s.legacyLink)
        .values({
          app: record.app,
          legacyUserId: record.legacyUserId,
          userId,
          legacyUsername: record.username ?? record.name,
          legacyEmail: record.email,
          passwordHash: record.passwordHash,
          method: group.records.length > 1 || group.anchorUserId ? "merge" : "import",
          importedAt: now,
        })
        .onConflictDoNothing()
    }
  })
  return { userId, created }
}

/** Applies the whole plan. New accounts are announced with user.created, joined ones with user.updated. */
export async function applyPlan(db: Db, groups: PlannedGroup[], options: { events?: boolean; onProgress?: (done: number) => void } = {}) {
  const now = new Date()
  let created = 0
  let joined = 0
  let done = 0
  for (const group of groups) {
    if (!group.newRecords.length && group.anchorUserId) continue
    const result = await applyGroup(db, group, now)
    if (result.created) created++
    else joined++
    if (options.events !== false) await emitUserEvent(result.created ? "user.created" : "user.updated", result.userId, db)
    options.onProgress?.(++done)
  }
  return { created, joined }
}
