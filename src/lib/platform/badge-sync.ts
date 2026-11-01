/**
 * Badge → Discord role (TRETU_BADGE_DISCORD_ROLES_JSON) and badge → TeamSpeak server group
 * (TRETU_BADGE_TS_GROUPS_JSON). Jobs are idempotent (state in platform_badge_sync), retried by the
 * worker and completely off when the env is missing.
 */
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";

import { platformBadgeSync, platformTsLinks, platformUserBadges, platformUsers } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { type Executor } from "@/lib/platform/db";
import { getDiscordSyncConfig, getTsBadgeGroups } from "@/lib/platform/env";
import { enqueueJob, type JobOutcome, type JobRow } from "@/lib/platform/jobs";
import { createTsQueryClient, teamspeakSyncEnabled } from "@/lib/platform/teamspeak";
import type { TeamSpeakQueryClient } from "@/lib/teamspeak/query-client";

export type SyncTarget = "discord" | "teamspeak";

function jobType(target: SyncTarget) {
  return target === "discord" ? ("badge.sync.discord" as const) : ("badge.sync.teamspeak" as const);
}

function mappedBadges(target: SyncTarget): string[] {
  if (target === "discord") return Object.keys(getDiscordSyncConfig()?.roles ?? {});
  return teamspeakSyncEnabled() ? Object.keys(getTsBadgeGroups()) : [];
}

async function record(db: Executor, sub: string, badgeKey: string, target: SyncTarget, status: "done" | "skipped", detail?: string) {
  await db
    .insert(platformBadgeSync)
    .values({ sub, badgeKey, target, status, detail: detail ?? null })
    .onConflictDoUpdate({
      target: [platformBadgeSync.sub, platformBadgeSync.badgeKey, platformBadgeSync.target],
      set: { status, detail: detail ?? null, updatedAt: new Date() },
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

/** Queues sync jobs for every earned, mapped badge of `sub` that is not synced yet (e.g. after linking). */
export async function enqueueBadgeResync(db: Executor, sub: string, target: SyncTarget | "all"): Promise<number> {
  let queued = 0;
  for (const t of target === "all" ? (["discord", "teamspeak"] as const) : [target]) {
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
 * Periodic reconciliation (worker): earned + mapped badges without a `done` sync whose user has the
 * needed link, plus `skipped` ones older than a day (e.g. user joined the Discord later).
 */
export async function reconcileBadgeSync(db: Executor, now: Date = new Date()): Promise<number> {
  let queued = 0;
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  for (const target of ["discord", "teamspeak"] as const) {
    const badges = mappedBadges(target);
    if (!badges.length) continue;
    const linkJoin =
      target === "discord"
        ? db
            .select({ sub: platformUserBadges.sub, badge: platformUserBadges.badgeKey })
            .from(platformUserBadges)
            .innerJoin(platformUsers, eq(platformUsers.sub, platformUserBadges.sub))
            .leftJoin(
              platformBadgeSync,
              and(
                eq(platformBadgeSync.sub, platformUserBadges.sub),
                eq(platformBadgeSync.badgeKey, platformUserBadges.badgeKey),
                eq(platformBadgeSync.target, target)
              )
            )
            .where(
              and(
                inArray(platformUserBadges.badgeKey, badges),
                isNotNull(platformUsers.discordId),
                or(isNull(platformBadgeSync.status), and(eq(platformBadgeSync.status, "skipped"), lt(platformBadgeSync.updatedAt, dayAgo)))
              )
            )
        : db
            .select({ sub: platformUserBadges.sub, badge: platformUserBadges.badgeKey })
            .from(platformUserBadges)
            .innerJoin(platformTsLinks, eq(platformTsLinks.sub, platformUserBadges.sub))
            .leftJoin(
              platformBadgeSync,
              and(
                eq(platformBadgeSync.sub, platformUserBadges.sub),
                eq(platformBadgeSync.badgeKey, platformUserBadges.badgeKey),
                eq(platformBadgeSync.target, target)
              )
            )
            .where(
              and(
                inArray(platformUserBadges.badgeKey, badges),
                isNotNull(platformTsLinks.verifiedAt),
                or(isNull(platformBadgeSync.status), and(eq(platformBadgeSync.status, "skipped"), lt(platformBadgeSync.updatedAt, dayAgo)))
              )
            );
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

/** Job `badge.sync.discord` {sub, badge}: PUT guild member role. */
export async function discordSyncJob(db: Executor, job: JobRow, fetchImpl: FetchLike = fetch): Promise<JobOutcome> {
  const config = getDiscordSyncConfig();
  const sub = String(job.payload.sub ?? "");
  const badge = String(job.payload.badge ?? "");
  const roleId = config?.roles[badge];
  if (!config || !roleId) return { status: "done" };
  if (await alreadyDone(db, sub, badge, "discord")) return { status: "done" };
  if (!(await stillEarned(db, sub, badge))) return { status: "done" };

  const [user] = await db.select({ discordId: platformUsers.discordId }).from(platformUsers).where(eq(platformUsers.sub, sub)).limit(1);
  if (!user?.discordId) {
    await record(db, sub, badge, "discord", "skipped", "no discord link");
    return { status: "done" };
  }
  const url = `https://discord.com/api/v10/guilds/${encodeURIComponent(config.guildId)}/members/${encodeURIComponent(user.discordId)}/roles/${encodeURIComponent(roleId)}`;
  const res = await fetchImpl(url, {
    method: "PUT",
    headers: {
      authorization: `Bot ${config.token}`,
      "x-audit-log-reason": encodeURIComponent(`Tretu badge ${badge}`),
      "user-agent": "TretuPlatform (https://tretu.de, 1.0)",
    },
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 204 || res.ok) {
    await record(db, sub, badge, "discord", "done");
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

function isIgnorableGroupError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("id=2561") || msg.includes("already") || msg.includes("duplicate");
}

/**
 * Handler factory for `badge.sync.teamspeak` jobs: one ServerQuery connection per worker batch.
 * Call `close()` after the batch.
 */
export function createTeamspeakSyncHandler(db: Executor, clientFactory: () => TeamSpeakQueryClient | null = createTsQueryClient) {
  let client: TeamSpeakQueryClient | null = null;
  let connected = false;
  return {
    async handle(job: JobRow): Promise<JobOutcome> {
      const groups = getTsBadgeGroups();
      const sub = String(job.payload.sub ?? "");
      const badge = String(job.payload.badge ?? "");
      const groupId = groups[badge];
      if (!groupId || !teamspeakSyncEnabled()) return { status: "done" };
      if (await alreadyDone(db, sub, badge, "teamspeak")) return { status: "done" };
      if (!(await stillEarned(db, sub, badge))) return { status: "done" };
      const [link] = await db.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub)).limit(1);
      if (!link?.verifiedAt || !link.tsClientDbId) {
        await record(db, sub, badge, "teamspeak", "skipped", "no teamspeak link");
        return { status: "done" };
      }
      if (!client) client = clientFactory();
      if (!client) return { status: "done" };
      if (!connected) {
        await client.connect(1);
        connected = true;
      }
      try {
        await client.serverGroupAddClient(groupId, link.tsClientDbId);
      } catch (error) {
        if (!isIgnorableGroupError(error)) throw error;
      }
      await record(db, sub, badge, "teamspeak", "done");
      return { status: "done" };
    },
    async close(): Promise<void> {
      if (client && connected) await client.disconnect().catch(() => undefined);
      client = null;
      connected = false;
    },
  };
}
