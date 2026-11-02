/**
 * Tretu-Konten in the central admin: search and detail (auth admin API + the platform's own data) and every
 * account mutation, forwarded to auth with `actorSub` and recorded in `platform_admin_audit`.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  platformBadgeRevocations,
  platformBadgeSync,
  platformFriendships,
  platformJobs,
  platformTsLinks,
  platformUserApps,
  platformUserBadges,
  platformUserProgress,
  platformUserStats,
  platformUsers,
} from "@/db/platform-schema";
import { users } from "@/db/schema";
import type { AdminActor } from "@/lib/admin/access";
import { ecosystemApp } from "@/lib/admin/apps";
import { listAdminAudit, type AuditRow } from "@/lib/admin/audit";
import { authAdmin, AuthAdminError, type AdminUserDetail, type MergeResponse } from "@/lib/admin/auth-admin";
import { AdminError, auditedMutation, takeMutationToken, validateReason } from "@/lib/admin/guard";
import { applyTretuLock, endLocalSessions } from "@/lib/auth/tretu-account";
import { getBadge } from "@/lib/platform/badges";
import { platformDb, type Executor } from "@/lib/platform/db";
import { levelInfo, type LevelInfo } from "@/lib/platform/levels";
import { peekBalance } from "@/lib/platform/wallet";

export const SUB_PATTERN = /^[A-Za-z0-9_.:@+-]{1,128}$/;
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function assertSub(sub: unknown): string {
  if (typeof sub !== "string" || !SUB_PATTERN.test(sub)) throw new AdminError("invalid_input", "sub");
  return sub;
}

/* --------------------------------- reading --------------------------------- */

export type PlatformSnapshot = {
  known: boolean;
  username: string | null;
  name: string | null;
  level: LevelInfo;
  badges: { key: string; title: string; icon: string; earnedAt: string; xp: number; credits: number }[];
  revokedBadges: string[];
  stats: { key: string; value: number }[];
  friends: number;
  balance: number | null;
  apps: { app: string; firstSeenAt: string; lastSeenAt: string }[];
  sync: { badgeKey: string; target: string; status: string; detail: string | null; updatedAt: string }[];
  pendingSyncJobs: number;
  teamspeak: { nickname: string | null; verifiedAt: string | null; error: string | null } | null;
};

/** Everything the platform (tretu.de) knows about `sub`. */
export async function getPlatformSnapshot(pdb: Executor, sub: string, locale: "de" | "en" = "de"): Promise<PlatformSnapshot> {
  const [directory, progress, badges, revoked, stats, [friends], balance, apps, sync, [pending], ts] = await Promise.all([
    pdb.select().from(platformUsers).where(eq(platformUsers.sub, sub)).limit(1),
    pdb.select({ xp: platformUserProgress.xp }).from(platformUserProgress).where(eq(platformUserProgress.sub, sub)).limit(1),
    pdb.select().from(platformUserBadges).where(eq(platformUserBadges.sub, sub)).orderBy(desc(platformUserBadges.earnedAt)),
    pdb.select({ key: platformBadgeRevocations.badgeKey }).from(platformBadgeRevocations).where(eq(platformBadgeRevocations.sub, sub)),
    pdb.select({ key: platformUserStats.key, value: platformUserStats.value }).from(platformUserStats).where(eq(platformUserStats.sub, sub)).orderBy(platformUserStats.key),
    pdb
      .select({ n: sql<number>`count(*)::int` })
      .from(platformFriendships)
      .where(or(eq(platformFriendships.subA, sub), eq(platformFriendships.subB, sub))),
    peekBalance(pdb, sub),
    pdb.select().from(platformUserApps).where(eq(platformUserApps.sub, sub)).orderBy(platformUserApps.firstSeenAt),
    pdb.select().from(platformBadgeSync).where(eq(platformBadgeSync.sub, sub)).orderBy(platformBadgeSync.badgeKey, platformBadgeSync.target),
    pdb
      .select({ n: sql<number>`count(*)::int` })
      .from(platformJobs)
      .where(
        and(
          eq(platformJobs.sub, sub),
          eq(platformJobs.status, "pending"),
          inArray(platformJobs.type, ["badge.sync.discord", "badge.sync.teamspeak"])
        )
      ),
    pdb.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub)).limit(1),
  ]);
  const user = directory[0];
  return {
    known: Boolean(user),
    username: user?.username ?? null,
    name: user?.name ?? null,
    level: levelInfo(progress[0]?.xp ?? 0),
    badges: badges.map((b) => {
      const def = getBadge(b.badgeKey);
      return {
        key: b.badgeKey,
        title: def?.title[locale] ?? b.badgeKey,
        icon: def?.icon ?? "Award",
        earnedAt: b.earnedAt.toISOString(),
        xp: b.xp,
        credits: b.credits,
      };
    }),
    revokedBadges: revoked.map((r) => r.key),
    stats: stats.map((s) => ({ key: s.key, value: s.value })),
    friends: friends?.n ?? 0,
    balance,
    apps: apps.map((a) => ({ app: a.app, firstSeenAt: a.firstSeenAt.toISOString(), lastSeenAt: a.lastSeenAt.toISOString() })),
    sync: sync.map((s) => ({ badgeKey: s.badgeKey, target: s.target, status: s.status, detail: s.detail, updatedAt: s.updatedAt.toISOString() })),
    pendingSyncJobs: pending?.n ?? 0,
    teamspeak: ts[0]
      ? { nickname: ts[0].tsNickname, verifiedAt: ts[0].verifiedAt?.toISOString() ?? null, error: ts[0].linkError }
      : null,
  };
}

export type AppAdminLink = { app: string; name: string; firstSeenAt: string; lastSeenAt: string; url: string | null; note: string | null };

/**
 * Apps the user has used (platform_user_apps) with a deep link into each app's own admin. Hollowmere has no web
 * admin: the Nakama user id is shown when auth knows it (legacy link), nothing else.
 */
export function appAdminLinks(sub: string, apps: PlatformSnapshot["apps"], legacyLinks: AdminUserDetail["legacyLinks"] = []): AppAdminLink[] {
  return apps.map((a) => {
    const app = ecosystemApp(a.app);
    const nakamaId = a.app === "hollowmere" ? (legacyLinks.find((l) => l.app === "hollowmere")?.legacyUserId ?? null) : null;
    return {
      app: a.app,
      name: app?.name ?? a.app,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
      url: app?.userAdminUrl ? app.userAdminUrl(sub) : null,
      note: nakamaId,
    };
  });
}

export type LocalHubUser = { id: number; roles: { key: string; source: string }[]; lockedAt: string | null };

/** The tretu.de user with this Tretu sub (hub sessions, local roles), if they ever signed in here. */
export async function getLocalHubUser(sub: string): Promise<LocalHubUser | null> {
  const [user] = await db.select({ id: users.id, lockedAt: users.tretuLockedAt }).from(users).where(eq(users.tretuSub, sub)).limit(1);
  if (!user) return null;
  const rows = (await db.execute(sql`
    select r.key, ur.source from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${user.id} order by r.key`)) as unknown as {
    key: string;
    source: string;
  }[];
  return { id: user.id, roles: rows.map((r) => ({ key: r.key, source: r.source })), lockedAt: user.lockedAt?.toISOString() ?? null };
}

export type AccountView = {
  sub: string;
  auth: { ok: true; user: AdminUserDetail } | { ok: false; error: AuthAdminError["code"] };
  platform: PlatformSnapshot | null;
  platformError: boolean;
  apps: AppAdminLink[];
  hubAudit: AuditRow[];
  local: LocalHubUser | null;
};

export async function getAccountView(sub: string, locale: "de" | "en" = "de"): Promise<AccountView> {
  assertSub(sub);
  const [authResult, platformResult, auditResult, local] = await Promise.all([
    authAdmin
      .user(sub)
      .then((user) => ({ ok: true as const, user }))
      .catch((error: unknown) => {
        if (error instanceof AuthAdminError) return { ok: false as const, error: error.code };
        throw error;
      }),
    getPlatformSnapshot(platformDb, sub, locale).catch(() => null),
    listAdminAudit(platformDb, { target: sub, limit: 50 }).catch(() => ({ items: [] as AuditRow[] })),
    getLocalHubUser(sub).catch(() => null),
  ]);
  return {
    sub,
    auth: authResult,
    platform: platformResult,
    platformError: platformResult === null,
    apps: platformResult ? appAdminLinks(sub, platformResult.apps, authResult.ok ? authResult.user.legacyLinks : []) : [],
    hubAudit: auditResult.items,
    local,
  };
}

/* -------------------------------- mutations -------------------------------- */

async function localUserId(sub: string): Promise<number | null> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.tretuSub, sub)).limit(1);
  return user?.id ?? null;
}

/** Ends the user's tretu.de sessions too (auth only ends its own sessions and refresh tokens). */
async function endHubSessions(sub: string): Promise<number> {
  const id = await localUserId(sub);
  return id ? endLocalSessions(db, id) : 0;
}

function roleList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) throw new AdminError("invalid_input", "roles");
  const list = [...new Set(value.map((r) => (typeof r === "string" ? r.trim().toLowerCase() : "")))];
  if (list.some((r) => !ROLE_PATTERN.test(r))) throw new AdminError("invalid_input", "roles");
  return list;
}

export async function changeRoles(actor: AdminActor, subInput: string, input: { add?: unknown; remove?: unknown; reason: unknown }) {
  const sub = assertSub(subInput);
  const add = roleList(input.add);
  const remove = roleList(input.remove).filter((r) => !add.includes(r));
  if (!add.length && !remove.length) throw new AdminError("invalid_input", "roles");
  if (sub === actor.sub && remove.includes("admin")) throw new AdminError("self_action");
  return auditedMutation(actor, { action: "account.roles", targetSub: sub, reason: input.reason, details: { add, remove } }, (reason) =>
    authAdmin.setRoles(sub, { actorSub: actor.sub, reason, ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}) })
  );
}

export async function revokeSessions(actor: AdminActor, subInput: string, input: { reason: unknown }) {
  const sub = assertSub(subInput);
  return auditedMutation(actor, { action: "account.sessions.revoke", targetSub: sub, reason: input.reason }, async (reason) => {
    await authAdmin.revokeSessions(sub, { actorSub: actor.sub, reason });
    return { auditDetails: { hubSessionsEnded: await endHubSessions(sub) } };
  });
}

/** `until` as ISO string in the future (or empty for an open-ended lock). */
function parseUntil(value: unknown, now: Date): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) throw new AdminError("invalid_input", "until");
  return d;
}

export async function lockAccount(actor: AdminActor, subInput: string, input: { reason: unknown; until?: unknown }, now: Date = new Date()) {
  const sub = assertSub(subInput);
  if (sub === actor.sub) throw new AdminError("self_action");
  const until = parseUntil(input.until, now);
  return auditedMutation(
    actor,
    { action: "account.lock", targetSub: sub, reason: input.reason, details: { until: until?.toISOString() ?? null } },
    async (reason) => {
      await authAdmin.lock(sub, { actorSub: actor.sub, reason, ...(until ? { until: until.toISOString() } : {}) });
      // Effective here right away; auth's user.updated confirms it shortly after.
      const id = await localUserId(sub);
      const ended = id ? (await applyTretuLock(db, id, { locked: true, until }, now)).sessionsEnded : 0;
      return { auditDetails: { hubSessionsEnded: ended } };
    }
  );
}

export async function unlockAccount(actor: AdminActor, subInput: string, input: { reason: unknown }) {
  const sub = assertSub(subInput);
  return auditedMutation(actor, { action: "account.unlock", targetSub: sub, reason: input.reason }, async (reason) => {
    await authAdmin.unlock(sub, { actorSub: actor.sub, reason });
    const id = await localUserId(sub);
    if (id) await applyTretuLock(db, id, { locked: false, until: null });
    return {};
  });
}

export async function resetTwoFactor(actor: AdminActor, subInput: string, input: { reason: unknown }) {
  const sub = assertSub(subInput);
  return auditedMutation(actor, { action: "account.two_factor.reset", targetSub: sub, reason: input.reason }, async (reason) => {
    await authAdmin.resetTwoFactor(sub, { actorSub: actor.sub, reason });
    return { auditDetails: { hubSessionsEnded: await endHubSessions(sub) } };
  });
}

export async function removeLink(actor: AdminActor, subInput: string, input: { reason: unknown; provider: unknown }) {
  const sub = assertSub(subInput);
  const provider = typeof input.provider === "string" ? input.provider.trim() : "";
  if (!PROVIDER_PATTERN.test(provider)) throw new AdminError("invalid_input", "provider");
  return auditedMutation(actor, { action: "account.link.remove", targetSub: sub, reason: input.reason, details: { provider } }, (reason) =>
    authAdmin.removeLink(sub, { actorSub: actor.sub, reason, provider })
  );
}

export async function verifyEmail(actor: AdminActor, subInput: string, input: { reason: unknown }) {
  const sub = assertSub(subInput);
  return auditedMutation(actor, { action: "account.email.verify", targetSub: sub, reason: input.reason }, (reason) =>
    authAdmin.verifyEmail(sub, { actorSub: actor.sub, reason })
  );
}

function mergePair(input: { from: unknown; into: unknown }): { from: string; into: string } {
  const from = assertSub(typeof input.from === "string" ? input.from.trim() : input.from);
  const into = assertSub(typeof input.into === "string" ? input.into.trim() : input.into);
  if (from === into) throw new AdminError("invalid_input", "same account");
  return { from, into };
}

/** Dry run: what a merge would move (nothing changes, not audited). Still rate-limited and needs a reason. */
export async function previewMerge(actor: AdminActor, input: { from: unknown; into: unknown; reason?: unknown }): Promise<MergeResponse> {
  const { from, into } = mergePair(input);
  const reason = validateReason(input.reason ?? "Vorschau der Zusammenführung");
  takeMutationToken(actor);
  return authAdmin.merge({ actorSub: actor.sub, reason, from, into, dryRun: true });
}

/** Merges old account `from` into `into` (auth sends user.deleted {mergedInto}; the platform moves wallet + stats). */
export async function mergeAccounts(actor: AdminActor, input: { from: unknown; into: unknown; reason: unknown }): Promise<MergeResponse> {
  const { from, into } = mergePair(input);
  return auditedMutation(actor, { action: "account.merge", targetSub: into, reason: input.reason, details: { from } }, (reason) =>
    authAdmin.merge({ actorSub: actor.sub, reason, from, into, dryRun: false })
  );
}
