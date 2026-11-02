/**
 * Event ingestion (contract §4): validation, idempotent storage on `id`, and processing into stats,
 * XP, badges, credits and the user directory. Each event is stored and processed in one transaction,
 * so a failure rolls both back and the sender's retry is processed normally.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { platformEvents, platformUserAchievements, platformUserApps } from "@/db/platform-schema";
import { enqueueBadgeResync, releaseStaleGrants } from "@/lib/platform/badge-sync";
import { inTransaction, platformDb, type Executor } from "@/lib/platform/db";
import { authUserSchema, ensureStub, isErased, upsertDirectoryUser } from "@/lib/platform/directory";
import { getEconomy, xpForStatIncrement } from "@/lib/platform/economy";
import { eraseUser } from "@/lib/platform/erasure";
import { applyAuthTeamspeakLink } from "@/lib/platform/ts-auth-link";
import { badRequest } from "@/lib/platform/errors";
import { emitPlatformEvent } from "@/lib/platform/outbox";
import { addToDailyCounter, addXp, incrementStat, lockProgress, settleProgress } from "@/lib/platform/progress";
import { bookTransaction, peekBalance, PLATFORM_LEDGER_APP } from "@/lib/platform/wallet";

export const MAX_BATCH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stat key prefixes an app may write (contract: `<app>.`; mc-dashboard reports as `minecraft.`). */
export function statPrefixesFor(app: string): string[] {
  return app === "mc-dashboard" ? ["mc-dashboard.", "minecraft."] : [`${app}.`];
}

/** Apps that do not count for `tretu.apps.used` (the hub and the identity provider). */
export const NON_USAGE_APPS = new Set(["auth", "tretu-web", "platform"]);

export const envelopeSchema = z.object({
  id: z.string().regex(UUID, "must be a UUID"),
  type: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/, "invalid type"),
  app: z.string().min(1).max(64),
  sub: z.string().min(1).max(128).nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type EventEnvelope = z.infer<typeof envelopeSchema>;

const statKey = z
  .string()
  .max(128)
  .regex(/^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/, "invalid key");

export const gameFinishedSchema = z.object({
  game: z
    .string()
    .transform((g) => g.trim().toLowerCase())
    .pipe(
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]{0,47}$/, "invalid game id")
        .refine((g) => g !== "games", "reserved game id")
    ),
  result: z.enum(["win", "loss", "draw", "completed"]),
  mode: z.enum(["solo", "multiplayer", "bot"]).optional(),
  durationSec: z.number().nonnegative().max(10_000_000).optional(),
  opponents: z.array(z.string().max(128)).max(50).optional(),
});

export const statIncrementSchema = z.object({
  key: statKey,
  by: z.number().int().positive().max(1_000_000),
});

export const achievementSchema = z.object({
  key: statKey,
  title: z.string().max(200).optional(),
});

/** Parses a request body (single envelope or `{events:[…]}`) and validates it for sender `app`. */
export function parseEventBody(body: unknown, app: string): EventEnvelope[] {
  let list: unknown[];
  if (body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as { events?: unknown }).events)) {
    list = (body as { events: unknown[] }).events;
    if (list.length === 0) throw badRequest("events must not be empty.");
    if (list.length > MAX_BATCH) throw badRequest(`At most ${MAX_BATCH} events per request.`, "batch_too_large");
  } else {
    list = [body];
  }

  return list.map((raw, index) => {
    const where = list.length > 1 ? `events.${index}` : "event";
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw badRequest(`${where}.${issue?.path.join(".") ?? ""}: ${issue?.message ?? "invalid"}`);
    }
    const event = parsed.data;
    if (event.app !== app) throw badRequest(`${where}: app must equal x-tretu-app.`, "app_mismatch");

    const check = (schema: z.ZodType) => {
      const r = schema.safeParse(event.data);
      if (!r.success) {
        const issue = r.error.issues[0];
        throw badRequest(`${where}.data.${issue?.path.join(".") ?? ""}: ${issue?.message ?? "invalid"}`);
      }
      return r.data as Record<string, unknown>;
    };

    switch (event.type) {
      case "game.finished":
        event.data = check(gameFinishedSchema);
        break;
      case "stat.increment":
      case "achievement.unlocked": {
        event.data = check(event.type === "stat.increment" ? statIncrementSchema : achievementSchema);
        const key = String(event.data.key);
        if (!statPrefixesFor(app).some((p) => key.startsWith(p))) {
          throw badRequest(`${where}.data.key must start with "${app}."`, "invalid_key");
        }
        break;
      }
      case "user.created":
      case "user.updated":
      case "user.deleted":
        if (app !== "auth") throw badRequest(`${where}: user.* events are accepted from auth only.`, "forbidden_type");
        if (!event.sub) throw badRequest(`${where}: sub is required.`);
        if (event.type !== "user.deleted") {
          if (typeof event.data.sub === "string" && event.data.sub !== event.sub) {
            throw badRequest(`${where}.data.sub must equal sub.`);
          }
          const r = authUserSchema.safeParse({ ...event.data, sub: event.sub });
          if (!r.success) throw badRequest(`${where}.data: invalid user`);
        }
        break;
      default:
        // Unknown types are stored for later use but award nothing.
        break;
    }
    return event;
  });
}

export type IngestResult = { accepted: number; duplicates: number };

export async function ingestEvents(events: EventEnvelope[], now: Date = new Date()): Promise<IngestResult> {
  const result: IngestResult = { accepted: 0, duplicates: 0 };
  for (const event of events) {
    const id = event.id.toLowerCase();
    const outcome = await inTransaction(platformDb, async (tx) => {
      const inserted = await tx
        .insert(platformEvents)
        .values({
          id,
          app: event.app,
          type: event.type,
          sub: event.sub,
          occurredAt: new Date(event.occurredAt),
          receivedAt: now,
          data: event.data,
          status: "processed",
        })
        .onConflictDoNothing()
        .returning({ id: platformEvents.id });
      if (!inserted.length) return "duplicate" as const;
      const status = await processEvent(tx, { ...event, id }, now);
      if (status !== "processed") {
        await tx
          .update(platformEvents)
          .set(status === "ignored" ? { status, sub: null, data: {} } : { status })
          .where(eq(platformEvents.id, id));
      }
      return "accepted" as const;
    });
    if (outcome === "duplicate") result.duplicates++;
    else result.accepted++;
  }
  return result;
}

type ProcessStatus = "processed" | "stored" | "ignored";

/**
 * A legacy account was merged into another Tretu-Konto (auth's claim flow sends
 * `user.deleted` with `data.mergedInto`). Before the old sub is erased, its wallet balance and
 * stats move to the surviving account. Idempotent: the bookings use deterministic keys, and the
 * stats copy only runs while the old stats still exist (they are erased right after).
 */
async function carryOverMergedAccount(tx: Executor, from: string, into: string, now: Date, eventId: string): Promise<void> {
  await ensureStub(tx, into);
  await lockProgress(tx, into);
  const balance = (await peekBalance(tx, from)) ?? 0;
  if (balance > 0) {
    await bookTransaction(tx, {
      sub: from,
      app: PLATFORM_LEDGER_APP,
      idempotencyKey: `merge-out:${from}`,
      kind: "adjust",
      amount: -balance,
      reason: "Konto zusammengeführt",
      ref: into,
      now,
    });
    await bookTransaction(tx, {
      sub: into,
      app: PLATFORM_LEDGER_APP,
      idempotencyKey: `merge-in:${from}`,
      kind: "migration",
      amount: balance,
      reason: "Guthaben aus zusammengeführtem Konto",
      ref: from,
      now,
    });
  }
  await tx.execute(sql`
    insert into platform_user_stats (sub, key, value, updated_at)
    select ${into}, key, value, ${now.toISOString()}::timestamptz from platform_user_stats where sub = ${from} and key <> 'tretu.friends'
    on conflict (sub, key) do update set value = platform_user_stats.value + excluded.value, updated_at = excluded.updated_at`);
  // The moved stats can unlock badges (and their Discord / TeamSpeak sync) on the surviving account.
  await settleProgress(tx, into, { now, sourceEventId: eventId });
}

async function processUserEvent(tx: Executor, event: EventEnvelope, now: Date): Promise<ProcessStatus> {
  const sub = event.sub as string;
  if (event.type === "user.deleted") {
    const mergedInto = typeof event.data.mergedInto === "string" ? event.data.mergedInto : null;
    const survivor = mergedInto && mergedInto !== sub && !(await isErased(tx, mergedInto)) ? mergedInto : null;
    if (survivor) await carryOverMergedAccount(tx, sub, survivor, now, event.id);
    await eraseUser(tx, sub, now, { mergedInto: survivor });
    return "processed";
  }
  if (await isErased(tx, sub)) return "ignored";
  const user = authUserSchema.parse({ ...event.data, sub });
  const { applied, previous, current } = await upsertDirectoryUser(tx, user, new Date(event.occurredAt));
  if (!applied || !current) return "processed";

  if (event.type === "user.updated") {
    await emitPlatformEvent(tx, { type: "user.updated", sub, data: event.data, exceptApps: ["auth"], now });
  }
  // TeamSpeak unlinked (or replaced) in Mein Konto: unlink here too and take back badge groups.
  await applyAuthTeamspeakLink(tx, sub, previous?.links, current.links);
  if ((previous?.discordId ?? null) !== (current.discordId ?? null)) {
    // Roles granted to the old Discord account are taken back, the new one gets them (if linked).
    await releaseStaleGrants(tx, { sub, target: "discord", previousIdentity: previous?.discordId ?? null });
    if (current.discordId) await enqueueBadgeResync(tx, sub, "discord");
  }
  // The account creation date can unlock the early-supporter badge.
  await lockProgress(tx, sub);
  await settleProgress(tx, sub, { now, sourceEventId: event.id });
  return "processed";
}

export async function processEvent(tx: Executor, event: EventEnvelope, now: Date): Promise<ProcessStatus> {
  if (event.type.startsWith("user.")) return processUserEvent(tx, event, now);
  const sub = event.sub;
  if (!sub) return "stored";
  if (await isErased(tx, sub)) return "ignored";

  await ensureStub(tx, sub);
  await lockProgress(tx, sub);
  const economy = getEconomy();
  const app = event.app;
  let known = true;

  if (!NON_USAGE_APPS.has(app)) {
    const firstUse = await tx
      .insert(platformUserApps)
      .values({ sub, app, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoNothing()
      .returning({ app: platformUserApps.app });
    if (firstUse.length) {
      await incrementStat(tx, sub, "tretu.apps.used", 1);
    } else {
      await tx
        .update(platformUserApps)
        .set({ lastSeenAt: now })
        .where(and(eq(platformUserApps.sub, sub), eq(platformUserApps.app, app)));
    }
  }

  switch (event.type) {
    case "game.finished": {
      const data = event.data as z.infer<typeof gameFinishedSchema>;
      await incrementStat(tx, sub, `${app}.games.played`, 1);
      await incrementStat(tx, sub, `${app}.${data.game}.played`, 1);
      let xp = economy.xpGamePlayed;
      if (data.result === "win") {
        await incrementStat(tx, sub, `${app}.games.won`, 1);
        await incrementStat(tx, sub, `${app}.${data.game}.won`, 1);
        xp += economy.xpGameWon;
        const credits = await addToDailyCounter(
          tx,
          sub,
          "credits:game_win",
          economy.gameWinReward,
          economy.gameWinRewardDailyCap,
          now
        );
        if (credits > 0) {
          await bookTransaction(tx, {
            sub,
            app: PLATFORM_LEDGER_APP,
            idempotencyKey: `gamewin:${event.id}`,
            kind: "reward",
            amount: credits,
            reason: "Sieg",
            ref: `${app}:${data.game}`,
            now,
          });
        }
      } else if (data.result === "completed") {
        xp += economy.xpGameCompleted;
      }
      await addXp(tx, sub, xp, { app, capped: true, now });
      break;
    }
    case "stat.increment": {
      const data = event.data as z.infer<typeof statIncrementSchema>;
      const { before, after } = await incrementStat(tx, sub, data.key, data.by);
      await addXp(tx, sub, xpForStatIncrement(data.key, before, after), { app, capped: true, now });
      break;
    }
    case "achievement.unlocked": {
      const data = event.data as z.infer<typeof achievementSchema>;
      const inserted = await tx
        .insert(platformUserAchievements)
        .values({ sub, key: data.key, app, title: data.title ?? null, unlockedAt: new Date(event.occurredAt) })
        .onConflictDoNothing()
        .returning({ key: platformUserAchievements.key });
      if (inserted.length) {
        await incrementStat(tx, sub, `${data.key.split(".")[0]}.achievements`, 1);
        await addXp(tx, sub, economy.xpAchievement, { app, capped: true, now });
      }
      break;
    }
    default:
      known = false;
  }

  await settleProgress(tx, sub, { now, sourceEventId: event.id });
  return known ? "processed" : "stored";
}
