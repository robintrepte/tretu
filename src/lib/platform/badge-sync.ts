/**
 * Badge → Discord role (TRETU_BADGE_DISCORD_ROLES_JSON) and badge → TeamSpeak server group
 * (TRETU_BADGE_TS_GROUPS_JSON). Jobs are idempotent (state in platform_badge_sync), retried by the
 * worker and completely off when the env is missing.
 *
 * Every grant records what was granted (`granted_to` = Discord user id / TS client database id,
 * `granted_ref` = role / server group id). Grants are taken back by `badge.revoke.*` jobs when
 *   - the user is deleted (`user.deleted`, also merges: see {@link releaseGrantsForErasure}),
 *   - the user's Discord / TeamSpeak identity changes or is unlinked,
 *   - the badge mapping env no longer maps the badge to that role / group (worker reconciliation).
 * Revoke jobs carry no `sub` (they must outlive the erasure) and their identity is scrubbed from the
 * payload once they finish. A role that another live grant still needs (same identity + role, e.g.
 * two badges mapped to one role, or a merged account) is never removed.
 */
import { and, eq, gt, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";

import { platformBadgeSync, platformTsLinks, platformUserBadges, platformUsers } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { inTransaction, type Executor } from "@/lib/platform/db";
import {
  getDiscordCredentials,
  getDiscordRoleMapStrict,
  getDiscordSyncConfig,
  getTsBadgeGroups,
  getTsBadgeGroupsStrict,
} from "@/lib/platform/env";
import { enqueueJob, type JobOutcome, type JobRow } from "@/lib/platform/jobs";
import { createTsQueryClient, teamspeakConfigured, teamspeakSyncEnabled } from "@/lib/platform/teamspeak";
import type { TeamSpeakQueryClient } from "@/lib/teamspeak/query-client";

export type SyncTarget = "discord" | "teamspeak";
export const SYNC_TARGETS = ["discord", "teamspeak"] as const;

type SyncRow = typeof platformBadgeSync.$inferSelect;

function jobType(target: SyncTarget) {
  return target === "discord" ? ("badge.sync.discord" as const) : ("badge.sync.teamspeak" as const);
}

export function revokeJobType(target: SyncTarget) {
  return target === "discord" ? ("badge.revoke.discord" as const) : ("badge.revoke.teamspeak" as const);
}

function mappedBadges(target: SyncTarget): string[] {
  if (target === "discord") return Object.keys(getDiscordSyncConfig()?.roles ?? {});
  return teamspeakSyncEnabled() ? Object.keys(getTsBadgeGroups()) : [];
}

/**
 * Current badge → role/group mapping as strings, or null when this target cannot be reconciled right
 * now (credentials missing, or the mapping env is invalid JSON: then nothing is removed by mistake).
 */
function currentMapping(target: SyncTarget): Record<string, string> | null {
  if (target === "discord") {
    if (!getDiscordCredentials()) return null;
    return getDiscordRoleMapStrict();
  }
  if (!teamspeakConfigured()) return null;
  const groups = getTsBadgeGroupsStrict();
  return groups ? Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, String(v)])) : null;
}

/** The identity a grant for `sub` goes to right now (null = no link). */
async function currentIdentity(db: Executor, sub: string, target: SyncTarget): Promise<string | null> {
  if (target === "discord") {
    const [user] = await db.select({ discordId: platformUsers.discordId }).from(platformUsers).where(eq(platformUsers.sub, sub)).limit(1);
    return user?.discordId ?? null;
  }
  const [link] = await db
    .select({ dbId: platformTsLinks.tsClientDbId, verifiedAt: platformTsLinks.verifiedAt })
    .from(platformTsLinks)
    .where(eq(platformTsLinks.sub, sub))
    .limit(1);
  return link?.verifiedAt && link.dbId ? String(link.dbId) : null;
}

async function record(db: Executor, sub: string, badgeKey: string, target: SyncTarget, status: "skipped", detail: string) {
  await db
    .insert(platformBadgeSync)
    .values({ sub, badgeKey, target, status, detail, grantedTo: null, grantedRef: null })
    .onConflictDoUpdate({
      target: [platformBadgeSync.sub, platformBadgeSync.badgeKey, platformBadgeSync.target],
      set: { status, detail, grantedTo: null, grantedRef: null, updatedAt: new Date() },
    });
}

export async function enqueueRevoke(
  db: Executor,
  target: SyncTarget,
  grant: { to: string; ref: string; badge: string; reason: string }
): Promise<void> {
  await enqueueJob(db, {
    type: revokeJobType(target),
    payload: { to: grant.to, ref: grant.ref, badge: grant.badge, reason: grant.reason },
    dedupeKey: `revoke:${target}:${grant.to}:${grant.ref}`,
    sub: null,
  });
}

/**
 * Records a successful grant. Serialised against {@link releaseGrantsForErasure} through the
 * directory row lock: if the user was erased while the request was in flight, the grant is queued
 * for removal instead of being recorded for a sub that no longer exists.
 */
async function recordGrant(db: Executor, sub: string, badgeKey: string, target: SyncTarget, to: string, ref: string): Promise<void> {
  await inTransaction(db, async (tx) => {
    const [user] = await tx.select({ sub: platformUsers.sub }).from(platformUsers).where(eq(platformUsers.sub, sub)).for("share");
    if (!user) {
      await enqueueRevoke(tx, target, { to, ref, badge: badgeKey, reason: "user.deleted" });
      return;
    }
    await tx
      .insert(platformBadgeSync)
      .values({ sub, badgeKey, target, status: "done", detail: null, grantedTo: to, grantedRef: ref })
      .onConflictDoUpdate({
        target: [platformBadgeSync.sub, platformBadgeSync.badgeKey, platformBadgeSync.target],
        set: { status: "done", detail: null, grantedTo: to, grantedRef: ref, updatedAt: new Date() },
      });
  });
}

async function alreadyDone(db: Executor, sub: string, badgeKey: string, target: SyncTarget): Promise<boolean> {
  const [row] = await db
    .select({ status: platformBadgeSync.status })
    .from(platformBadgeSync)
    .where(and(eq(platformBadgeSync.sub, sub), eq(platformBadgeSync.badgeKey, badgeKey), eq(platformBadgeSync.target, target)))
    .limit(1);
  return row?.status === "done";
}

async function stillEarned(db: Executor, sub: string, badgeKey: string): Promise<boolean> {
  const rows = await db
    .select({ key: platformUserBadges.badgeKey })
    .from(platformUserBadges)
    .where(and(eq(platformUserBadges.sub, sub), eq(platformUserBadges.badgeKey, badgeKey)))
    .limit(1);
  return rows.length > 0;
}

/** Another live grant still needs this role/group on this identity (then a revoke is a no-op). */
async function stillHeld(db: Executor, target: SyncTarget, to: string, ref: string): Promise<boolean> {
  const rows = await db
    .select({ sub: platformBadgeSync.sub })
    .from(platformBadgeSync)
    .where(
      and(
        eq(platformBadgeSync.target, target),
        eq(platformBadgeSync.status, "done"),
        eq(platformBadgeSync.grantedTo, to),
        eq(platformBadgeSync.grantedRef, ref)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** A forced sync (admin "resync") grants again even when the role / group is recorded as granted. */
function isForced(job: JobRow): boolean {
  return job.payload.force === true;
}

/**
 * Admin "resync": takes back grants that no longer apply, then grants every earned, mapped badge of
 * `sub` again (also those recorded as done, in case a role was removed by hand in Discord / TeamSpeak).
 * Returns the number of queued sync jobs.
 */
export async function forceBadgeResync(db: Executor, sub: string): Promise<number> {
  await releaseStaleGrants(db, { sub });
  let queued = 0;
  for (const target of SYNC_TARGETS) {
    const badges = mappedBadges(target);
    if (!badges.length) continue;
    const earned = await db
      .select({ key: platformUserBadges.badgeKey })
      .from(platformUserBadges)
      .where(and(eq(platformUserBadges.sub, sub), inArray(platformUserBadges.badgeKey, badges)));
    for (const { key } of earned) {
      await enqueueJob(db, {
        type: jobType(target),
        payload: { sub, badge: key, force: true },
        dedupeKey: `${target}:${sub}:${key}:force`,
        sub,
      });
      queued++;
    }
  }
  return queued;
}

/**
 * Admin revoke of a badge (same transaction as removing the badge row): takes back what was granted
 * for it and forgets the sync state, so a later manual grant syncs again.
 */
export async function releaseBadgeGrants(tx: Executor, sub: string, badgeKey: string): Promise<number> {
  const rows = await tx
    .delete(platformBadgeSync)
    .where(and(eq(platformBadgeSync.sub, sub), eq(platformBadgeSync.badgeKey, badgeKey)))
    .returning();
  let queued = 0;
  for (const row of rows) {
    if (row.status !== "done" || !row.grantedTo || !row.grantedRef) continue;
    await enqueueRevoke(tx, row.target as SyncTarget, { to: row.grantedTo, ref: row.grantedRef, badge: badgeKey, reason: "badge.revoked" });
    queued++;
  }
  return queued;
}

/** Queues sync jobs for every earned, mapped badge of `sub` that is not synced yet (e.g. after linking). */
export async function enqueueBadgeResync(db: Executor, sub: string, target: SyncTarget | "all"): Promise<number> {
  let queued = 0;
  for (const t of target === "all" ? SYNC_TARGETS : [target]) {
    const badges = mappedBadges(t);
    if (!badges.length) continue;
    const earned = await db
      .select({ key: platformUserBadges.badgeKey })
      .from(platformUserBadges)
      .where(and(eq(platformUserBadges.sub, sub), inArray(platformUserBadges.badgeKey, badges)));
    for (const { key } of earned) {
      if (await alreadyDone(db, sub, key, t)) continue;
      await enqueueJob(db, { type: jobType(t), payload: { sub, badge: key }, dedupeKey: `${t}:${sub}:${key}`, sub });
      queued++;
    }
  }
  return queued;
}

/**
 * Fills `granted_to` / `granted_ref` of done rows written before those columns existed, using the
 * identity and mapping that were in effect (the caller passes the identity when it already changed).
 */
async function backfillLegacyRows(db: Executor, rows: SyncRow[], target: SyncTarget, identity: (sub: string) => Promise<string | null>) {
  const mapping = target === "discord" ? getDiscordRoleMapStrict() : getTsBadgeGroupsStrict();
  for (const row of rows) {
    if (row.grantedTo && row.grantedRef) continue;
    const to = row.grantedTo ?? (await identity(row.sub));
    const mapped = mapping?.[row.badgeKey];
    const ref = row.grantedRef ?? (mapped === undefined ? null : String(mapped));
    if (to === row.grantedTo && ref === row.grantedRef) continue;
    await db
      .update(platformBadgeSync)
      .set({ grantedTo: to, grantedRef: ref })
      .where(and(eq(platformBadgeSync.sub, row.sub), eq(platformBadgeSync.badgeKey, row.badgeKey), eq(platformBadgeSync.target, target)));
    row.grantedTo = to;
    row.grantedRef = ref;
  }
}

async function doneRows(
  db: Executor,
  target: SyncTarget,
  options: { sub?: string; after?: { sub: string; badgeKey: string }; limit?: number } = {}
): Promise<SyncRow[]> {
  const after = options.after;
  return db
    .select()
    .from(platformBadgeSync)
    .where(
      and(
        eq(platformBadgeSync.target, target),
        eq(platformBadgeSync.status, "done"),
        options.sub ? eq(platformBadgeSync.sub, options.sub) : undefined,
        after
          ? or(gt(platformBadgeSync.sub, after.sub), and(eq(platformBadgeSync.sub, after.sub), gt(platformBadgeSync.badgeKey, after.badgeKey)))
          : undefined
      )
    )
    .orderBy(platformBadgeSync.sub, platformBadgeSync.badgeKey)
    .limit(options.limit ?? 500);
}

/**
 * Takes back grants that no longer apply: the badge is not mapped any more, maps to another
 * role/group, or the user's identity changed / was unlinked. The sync row is removed (so the badge
 * is granted again to the new role / identity by {@link reconcileBadgeSync} or a resync) and a
 * revoke job is queued for what was granted. `previousIdentity` is used for rows from before the
 * `granted_*` columns when the caller already replaced the identity.
 */
export async function releaseStaleGrants(
  db: Executor,
  options: { sub?: string; target?: SyncTarget; previousIdentity?: string | null } = {}
): Promise<number> {
  let released = 0;
  for (const target of options.target ? [options.target] : SYNC_TARGETS) {
    const mapping = currentMapping(target);
    if (!mapping) continue;
    const identities = new Map<string, string | null>();
    const identityOf = async (sub: string) => {
      if (!identities.has(sub)) identities.set(sub, await currentIdentity(db, sub, target));
      return identities.get(sub) ?? null;
    };
    let after: { sub: string; badgeKey: string } | undefined;
    for (;;) {
      const rows = await doneRows(db, target, { sub: options.sub, after });
      if (!rows.length) break;
      after = { sub: rows[rows.length - 1].sub, badgeKey: rows[rows.length - 1].badgeKey };
      await backfillLegacyRows(db, rows, target, async (s) =>
        options.sub && options.previousIdentity !== undefined ? options.previousIdentity : identityOf(s)
      );
      for (const row of rows) {
        const identity = await identityOf(row.sub);
        const mapped = mapping[row.badgeKey];
        const stale = mapped === undefined || mapped !== row.grantedRef || identity === null || identity !== row.grantedTo;
        if (!stale) continue;
        await inTransaction(db, async (tx) => {
          const deleted = await tx
            .delete(platformBadgeSync)
            .where(
              and(
                eq(platformBadgeSync.sub, row.sub),
                eq(platformBadgeSync.badgeKey, row.badgeKey),
                eq(platformBadgeSync.target, target),
                eq(platformBadgeSync.status, "done")
              )
            )
            .returning({ sub: platformBadgeSync.sub });
          if (!deleted.length) return;
          if (row.grantedTo && row.grantedRef) {
            const reason = mapped === undefined || mapped !== row.grantedRef ? "mapping.changed" : "identity.changed";
            await enqueueRevoke(tx, target, { to: row.grantedTo, ref: row.grantedRef, badge: row.badgeKey, reason });
          } else {
            log("warn", "platform.badge_sync.release_unknown_grant", { target, badge: row.badgeKey });
          }
        });
        released++;
      }
    }
  }
  if (released) log("info", "platform.badge_sync.released", { released });
  return released;
}

/**
 * Called by `eraseUser` (same transaction, before anything is deleted): captures every grant of
 * `sub` and either queues its removal or, for a merge (`mergedInto`), hands it to the surviving
 * account when that account has the same Discord / TeamSpeak identity. A verified TeamSpeak link moves
 * to the surviving account when it has none (same person, proven by auth's merge). Locks the
 * directory row first so a grant finishing concurrently is serialised with the erasure.
 */
export async function releaseGrantsForErasure(tx: Executor, sub: string, mergedInto: string | null): Promise<number> {
  await tx.select({ sub: platformUsers.sub }).from(platformUsers).where(eq(platformUsers.sub, sub)).for("update");
  const reason = mergedInto ? "user.merged" : "user.deleted";
  // Identities of the deleted account, captured before anything moves or is erased.
  const legacyIdentity: Record<SyncTarget, string | null> = {
    discord: await currentIdentity(tx, sub, "discord"),
    teamspeak: await currentIdentity(tx, sub, "teamspeak"),
  };

  if (mergedInto) {
    const [survivorLink] = await tx.select().from(platformTsLinks).where(eq(platformTsLinks.sub, mergedInto)).limit(1);
    if (legacyIdentity.teamspeak && !survivorLink?.verifiedAt) {
      if (survivorLink) await tx.delete(platformTsLinks).where(eq(platformTsLinks.sub, mergedInto));
      await tx.update(platformTsLinks).set({ sub: mergedInto, updatedAt: new Date() }).where(eq(platformTsLinks.sub, sub));
    }
  }

  let handled = 0;
  for (const target of SYNC_TARGETS) {
    const rows = await doneRows(tx, target, { sub, limit: 10_000 });
    if (!rows.length) continue;
    // Rows from before the granted_* columns were granted to the identity linked right now.
    await backfillLegacyRows(tx, rows, target, async () => legacyIdentity[target]);
    const survivorIdentity = mergedInto ? await currentIdentity(tx, mergedInto, target) : null;
    for (const row of rows) {
      if (!row.grantedTo || !row.grantedRef) {
        log("warn", "platform.badge_sync.release_unknown_grant", { target, badge: row.badgeKey });
        continue;
      }
      if (mergedInto && survivorIdentity && survivorIdentity === row.grantedTo) {
        await tx
          .insert(platformBadgeSync)
          .values({ sub: mergedInto, badgeKey: row.badgeKey, target, status: "done", grantedTo: row.grantedTo, grantedRef: row.grantedRef })
          .onConflictDoUpdate({
            target: [platformBadgeSync.sub, platformBadgeSync.badgeKey, platformBadgeSync.target],
            set: { status: "done", detail: null, grantedTo: row.grantedTo, grantedRef: row.grantedRef, updatedAt: new Date() },
            setWhere: ne(platformBadgeSync.status, "done"),
          });
      } else {
        await enqueueRevoke(tx, target, { to: row.grantedTo, ref: row.grantedRef, badge: row.badgeKey, reason });
      }
      handled++;
    }
  }
  return handled;
}

/**
 * Periodic reconciliation (worker): first takes back grants that no longer map (changed env) or whose
 * identity changed, then queues earned + mapped badges without a `done` sync whose user has the
 * needed link, plus `skipped` ones older than a day (e.g. user joined the Discord later).
 */
export async function reconcileBadgeSync(db: Executor, now: Date = new Date()): Promise<number> {
  await releaseStaleGrants(db);
  let queued = 0;
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  for (const target of SYNC_TARGETS) {
    const badges = mappedBadges(target);
    if (!badges.length) continue;
    const syncJoin = and(
      eq(platformBadgeSync.sub, platformUserBadges.sub),
      eq(platformBadgeSync.badgeKey, platformUserBadges.badgeKey),
      eq(platformBadgeSync.target, target)
    );
    const due = or(isNull(platformBadgeSync.status), and(eq(platformBadgeSync.status, "skipped"), lt(platformBadgeSync.updatedAt, dayAgo)));
    const linkJoin =
      target === "discord"
        ? db
            .select({ sub: platformUserBadges.sub, badge: platformUserBadges.badgeKey })
            .from(platformUserBadges)
            .innerJoin(platformUsers, eq(platformUsers.sub, platformUserBadges.sub))
            .leftJoin(platformBadgeSync, syncJoin)
            .where(and(inArray(platformUserBadges.badgeKey, badges), isNotNull(platformUsers.discordId), due))
        : db
            .select({ sub: platformUserBadges.sub, badge: platformUserBadges.badgeKey })
            .from(platformUserBadges)
            .innerJoin(platformTsLinks, eq(platformTsLinks.sub, platformUserBadges.sub))
            .leftJoin(platformBadgeSync, syncJoin)
            .where(and(inArray(platformUserBadges.badgeKey, badges), isNotNull(platformTsLinks.verifiedAt), due));
    const rows = await linkJoin.limit(500);
    for (const row of rows) {
      await enqueueJob(db, {
        type: jobType(target),
        payload: { sub: row.sub, badge: row.badge },
        dedupeKey: `${target}:${row.sub}:${row.badge}`,
        sub: row.sub,
      });
      queued++;
    }
  }
  return queued;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_USER_AGENT = "TretuPlatform (https://tretu.de, 1.0)";

function discordRoleUrl(guildId: string, discordId: string, roleId: string): string {
  return `${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}/roles/${encodeURIComponent(roleId)}`;
}

/** Job `badge.sync.discord` {sub, badge}: PUT guild member role. */
export async function discordSyncJob(db: Executor, job: JobRow, fetchImpl: FetchLike = fetch): Promise<JobOutcome> {
  const config = getDiscordSyncConfig();
  const sub = String(job.payload.sub ?? "");
  const badge = String(job.payload.badge ?? "");
  const roleId = config?.roles[badge];
  if (!config || !roleId) return { status: "done" };
  if (!isForced(job) && (await alreadyDone(db, sub, badge, "discord"))) return { status: "done" };
  if (!(await stillEarned(db, sub, badge))) return { status: "done" };

  const discordId = await currentIdentity(db, sub, "discord");
  if (!discordId) {
    await record(db, sub, badge, "discord", "skipped", "no discord link");
    return { status: "done" };
  }
  const res = await fetchImpl(discordRoleUrl(config.guildId, discordId, roleId), {
    method: "PUT",
    headers: {
      authorization: `Bot ${config.token}`,
      "x-audit-log-reason": encodeURIComponent(`Tretu badge ${badge}`),
      "user-agent": DISCORD_USER_AGENT,
    },
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 204 || res.ok) {
    await recordGrant(db, sub, badge, "discord", discordId, roleId);
    return { status: "done" };
  }
  if (res.status === 404) {
    await record(db, sub, badge, "discord", "skipped", "not a guild member");
    return { status: "done" };
  }
  const detail = `Discord answered ${res.status}`;
  if (res.status === 401 || res.status === 403) log("error", "platform.badge_sync.discord_forbidden", { status: res.status });
  return { status: "retry", error: detail };
}

function revokePayload(job: JobRow): { to: string; ref: string; badge: string; reason: string } | null {
  const to = typeof job.payload.to === "string" ? job.payload.to : "";
  const ref = typeof job.payload.ref === "string" ? job.payload.ref : "";
  if (!to || !ref) return null;
  return { to, ref, badge: String(job.payload.badge ?? ""), reason: String(job.payload.reason ?? "") };
}

/** Job `badge.revoke.discord` {to, ref, badge, reason}: DELETE guild member role (404 = already gone). */
export async function discordRevokeJob(db: Executor, job: JobRow, fetchImpl: FetchLike = fetch): Promise<JobOutcome> {
  const grant = revokePayload(job);
  if (!grant) return { status: "failed", error: "invalid revoke payload" };
  const credentials = getDiscordCredentials();
  // Keep retrying (up to the job's max age): the bot token may only be missing during a redeploy.
  if (!credentials) return { status: "retry", error: "Discord bot not configured" };
  if (await stillHeld(db, "discord", grant.to, grant.ref)) return { status: "done" };
  const res = await fetchImpl(discordRoleUrl(credentials.guildId, grant.to, grant.ref), {
    method: "DELETE",
    headers: {
      authorization: `Bot ${credentials.token}`,
      "x-audit-log-reason": encodeURIComponent(`Tretu badge ${grant.badge || "role"} removed (${grant.reason || "revoke"})`),
      "user-agent": DISCORD_USER_AGENT,
    },
    signal: AbortSignal.timeout(5000),
  });
  // 204 removed; 404 unknown member / role: nothing left to remove.
  if (res.status === 204 || res.ok || res.status === 404) return { status: "done" };
  if (res.status === 401 || res.status === 403) log("error", "platform.badge_sync.discord_forbidden", { status: res.status });
  return { status: "retry", error: `Discord answered ${res.status}` };
}

function isIgnorableGroupError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("id=2561") || msg.includes("already") || msg.includes("duplicate");
}

/** servergroupdelclient errors that mean "nothing to remove": not in group, unknown group / client. */
function isIgnorableRemoveError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("id=2563") || // client is not in this server group
    msg.includes("id=2560") || // invalid server group id
    msg.includes("id=512") || // invalid client id
    msg.includes("id=1281") || // database empty result set
    msg.includes("not in") ||
    msg.includes("empty result")
  );
}

/**
 * Handler factory for `badge.sync.teamspeak` and `badge.revoke.teamspeak` jobs: one ServerQuery
 * connection per worker batch. Call `close()` after the batch.
 */
export function createTeamspeakSyncHandler(db: Executor, clientFactory: () => TeamSpeakQueryClient | null = createTsQueryClient) {
  let client: TeamSpeakQueryClient | null = null;
  let connected = false;
  async function connectedClient(): Promise<TeamSpeakQueryClient | null> {
    if (!client) client = clientFactory();
    if (!client) return null;
    if (!connected) {
      await client.connect(1);
      connected = true;
    }
    return client;
  }
  return {
    async handle(job: JobRow): Promise<JobOutcome> {
      const groups = getTsBadgeGroups();
      const sub = String(job.payload.sub ?? "");
      const badge = String(job.payload.badge ?? "");
      const groupId = groups[badge];
      if (!groupId || !teamspeakSyncEnabled()) return { status: "done" };
      if (!isForced(job) && (await alreadyDone(db, sub, badge, "teamspeak"))) return { status: "done" };
      if (!(await stillEarned(db, sub, badge))) return { status: "done" };
      const dbId = await currentIdentity(db, sub, "teamspeak");
      if (!dbId) {
        await record(db, sub, badge, "teamspeak", "skipped", "no teamspeak link");
        return { status: "done" };
      }
      const query = await connectedClient();
      if (!query) return { status: "done" };
      try {
        await query.serverGroupAddClient(groupId, Number(dbId));
      } catch (error) {
        if (!isIgnorableGroupError(error)) throw error;
      }
      await recordGrant(db, sub, badge, "teamspeak", dbId, String(groupId));
      return { status: "done" };
    },
    async revoke(job: JobRow): Promise<JobOutcome> {
      const grant = revokePayload(job);
      if (!grant) return { status: "failed", error: "invalid revoke payload" };
      const groupId = Number(grant.ref);
      const dbId = Number(grant.to);
      if (!Number.isInteger(groupId) || groupId <= 0 || !Number.isInteger(dbId) || dbId <= 0) {
        return { status: "failed", error: "invalid revoke payload" };
      }
      if (!teamspeakConfigured()) return { status: "retry", error: "TeamSpeak ServerQuery not configured" };
      if (await stillHeld(db, "teamspeak", grant.to, grant.ref)) return { status: "done" };
      const query = await connectedClient();
      if (!query) return { status: "retry", error: "TeamSpeak ServerQuery not configured" };
      try {
        await query.serverGroupDelClient(groupId, dbId);
      } catch (error) {
        if (!isIgnorableRemoveError(error)) throw error;
      }
      return { status: "done" };
    },
    async close(): Promise<void> {
      if (client && connected) await client.disconnect().catch(() => undefined);
      client = null;
      connected = false;
    },
  };
}
