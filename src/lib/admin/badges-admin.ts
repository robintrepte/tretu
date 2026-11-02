/**
 * Badges in the central admin: catalog with counts, holders, manual grant / revoke and the Discord / TeamSpeak
 * sync state with a forced resync (central admin spec, "Badges").
 *
 * - Grant: awards the badge like the rules do (XP, one-time credits `badge:<key>:<sub>`, notification,
 *   `badge.earned`, role/group sync) and lifts an earlier revocation.
 * - Revoke: removes the badge row and its XP (the level follows), takes back the Discord role / TeamSpeak group
 *   granted for it and blocks the rules from awarding it again. Credits already paid stay.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  platformBadgeRevocations,
  platformBadgeSync,
  platformJobs,
  platformUserBadges,
  platformUserProgress,
  platformUsers,
} from "@/db/platform-schema";
import type { AdminActor } from "@/lib/admin/access";
import { assertSub } from "@/lib/admin/accounts";
import { AdminError, auditedMutation } from "@/lib/admin/guard";
import { forceBadgeResync, releaseBadgeGrants } from "@/lib/platform/badge-sync";
import { BADGES, getBadge, type BadgeDefinition } from "@/lib/platform/badges";
import { inTransaction, platformDb, type Executor } from "@/lib/platform/db";
import { ensureUser } from "@/lib/platform/directory";
import { getDiscordSyncConfig, getTsBadgeGroups } from "@/lib/platform/env";
import { levelForXp } from "@/lib/platform/levels";
import { awardBadge, lockProgress, settleProgress } from "@/lib/platform/progress";

export type CatalogEntry = BadgeDefinition & { holders: number; discordRole: string | null; teamspeakGroup: number | null };

export async function badgeCatalog(db: Executor = platformDb): Promise<CatalogEntry[]> {
  const counts = await db
    .select({ key: platformUserBadges.badgeKey, n: sql<number>`count(*)::int` })
    .from(platformUserBadges)
    .groupBy(platformUserBadges.badgeKey);
  const byKey = new Map(counts.map((c) => [c.key, c.n]));
  const roles = getDiscordSyncConfig()?.roles ?? {};
  const groups = getTsBadgeGroups();
  return BADGES.map((b) => ({ ...b, holders: byKey.get(b.key) ?? 0, discordRole: roles[b.key] ?? null, teamspeakGroup: groups[b.key] ?? null }));
}

export type BadgeHolder = {
  sub: string;
  name: string | null;
  username: string | null;
  earnedAt: string;
  sync: { target: string; status: string; detail: string | null }[];
};

export async function badgeHolders(db: Executor, badgeKey: string, options: { limit?: number; offset?: number } = {}): Promise<{ total: number; items: BadgeHolder[] }> {
  if (!getBadge(badgeKey)) throw new AdminError("unknown_badge");
  const limit = Math.min(200, Math.max(1, options.limit ?? 100));
  const offset = Math.max(0, options.offset ?? 0);
  const [[total], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(platformUserBadges).where(eq(platformUserBadges.badgeKey, badgeKey)),
    db
      .select({ sub: platformUserBadges.sub, earnedAt: platformUserBadges.earnedAt, name: platformUsers.name, username: platformUsers.username })
      .from(platformUserBadges)
      .leftJoin(platformUsers, eq(platformUsers.sub, platformUserBadges.sub))
      .where(eq(platformUserBadges.badgeKey, badgeKey))
      .orderBy(desc(platformUserBadges.earnedAt))
      .limit(limit)
      .offset(offset),
  ]);
  const subs = rows.map((r) => r.sub);
  const sync = subs.length
    ? await db
        .select()
        .from(platformBadgeSync)
        .where(and(eq(platformBadgeSync.badgeKey, badgeKey), inArray(platformBadgeSync.sub, subs)))
    : [];
  return {
    total: total?.n ?? 0,
    items: rows.map((r) => ({
      sub: r.sub,
      name: r.name,
      username: r.username,
      earnedAt: r.earnedAt.toISOString(),
      sync: sync.filter((s) => s.sub === r.sub).map((s) => ({ target: s.target, status: s.status, detail: s.detail })),
    })),
  };
}

export type SyncOverview = {
  discordEnabled: boolean;
  teamspeakEnabled: boolean;
  rows: { badgeKey: string; target: string; status: string; detail: string | null; updatedAt: string }[];
  pendingJobs: { type: string; badge: string | null; attempts: number; lastError: string | null }[];
};

/** Discord / TeamSpeak sync state of one user (per badge and target) plus their queued sync jobs. */
export async function syncStatus(db: Executor, sub: string): Promise<SyncOverview> {
  assertSub(sub);
  const [rows, jobs] = await Promise.all([
    db.select().from(platformBadgeSync).where(eq(platformBadgeSync.sub, sub)).orderBy(platformBadgeSync.badgeKey),
    db
      .select()
      .from(platformJobs)
      .where(and(eq(platformJobs.sub, sub), eq(platformJobs.status, "pending"), inArray(platformJobs.type, ["badge.sync.discord", "badge.sync.teamspeak"])))
      .orderBy(platformJobs.id),
  ]);
  return {
    discordEnabled: Boolean(getDiscordSyncConfig()),
    teamspeakEnabled: Object.keys(getTsBadgeGroups()).length > 0,
    rows: rows.map((r) => ({ badgeKey: r.badgeKey, target: r.target, status: r.status, detail: r.detail, updatedAt: r.updatedAt.toISOString() })),
    pendingJobs: jobs.map((j) => ({
      type: j.type,
      badge: typeof j.payload.badge === "string" ? j.payload.badge : null,
      attempts: j.attempts,
      lastError: j.lastError,
    })),
  };
}

function requireBadge(key: unknown): BadgeDefinition {
  const badge = typeof key === "string" ? getBadge(key) : undefined;
  if (!badge) throw new AdminError("unknown_badge");
  return badge;
}

async function requireKnownUser(sub: string): Promise<void> {
  if (!(await ensureUser(platformDb, sub, { createStub: false }))) throw new AdminError("user_not_found");
}

export async function grantBadge(actor: AdminActor, input: { sub: string; badge: unknown; reason: unknown }, now: Date = new Date()) {
  const sub = assertSub(input.sub);
  const badge = requireBadge(input.badge);
  return auditedMutation(actor, { action: "badge.grant", targetSub: sub, reason: input.reason, details: { badge: badge.key } }, async () => {
    await requireKnownUser(sub);
    await inTransaction(platformDb, async (tx) => {
      await lockProgress(tx, sub);
      await tx.delete(platformBadgeRevocations).where(and(eq(platformBadgeRevocations.sub, sub), eq(platformBadgeRevocations.badgeKey, badge.key)));
      if (!(await awardBadge(tx, sub, badge, { now }))) throw new AdminError("already_earned");
      // The badge XP can mean a level-up (and the new stats may unlock nothing else; settle anyway).
      await settleProgress(tx, sub, { now });
    });
    return {};
  });
}

export async function revokeBadge(actor: AdminActor, input: { sub: string; badge: unknown; reason: unknown }, now: Date = new Date()) {
  const sub = assertSub(input.sub);
  const badge = requireBadge(input.badge);
  return auditedMutation(actor, { action: "badge.revoke", targetSub: sub, reason: input.reason, details: { badge: badge.key } }, async () => {
    return inTransaction(platformDb, async (tx) => {
      const progress = await lockProgress(tx, sub);
      const [removed] = await tx
        .delete(platformUserBadges)
        .where(and(eq(platformUserBadges.sub, sub), eq(platformUserBadges.badgeKey, badge.key)))
        .returning({ xp: platformUserBadges.xp });
      if (!removed) throw new AdminError("not_earned");
      const xp = Math.max(0, progress.xp - removed.xp);
      await tx.update(platformUserProgress).set({ xp, level: levelForXp(xp), updatedAt: now }).where(eq(platformUserProgress.sub, sub));
      await tx
        .insert(platformBadgeRevocations)
        .values({ sub, badgeKey: badge.key, actorSub: actor.sub, revokedAt: now })
        .onConflictDoUpdate({
          target: [platformBadgeRevocations.sub, platformBadgeRevocations.badgeKey],
          set: { actorSub: actor.sub, revokedAt: now },
        });
      const revokeJobs = await releaseBadgeGrants(tx, sub, badge.key);
      return { auditDetails: { xpRemoved: removed.xp, revokeJobs } };
    });
  });
}

export async function resyncBadges(actor: AdminActor, input: { sub: string; reason: unknown }) {
  const sub = assertSub(input.sub);
  return auditedMutation(actor, { action: "badge.resync", targetSub: sub, reason: input.reason }, async () => {
    const queued = await inTransaction(platformDb, (tx) => forceBadgeResync(tx, sub));
    return { queued, auditDetails: { queued } };
  });
}
