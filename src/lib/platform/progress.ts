/**
 * Per-user stats, XP (with a daily cap per app), levels and badge awarding.
 * Callers lock the user's progress row first ({@link lockProgress}) so all processing for one user
 * is serialised; badge inserts are additionally protected by the (sub, badge) primary key.
 */
import { and, eq, sql } from "drizzle-orm";

import {
  platformDailyCounters,
  platformUserBadges,
  platformUserProgress,
  platformUserStats,
} from "@/db/platform-schema";
import { newlyEarnedBadges, type BadgeDefinition } from "@/lib/platform/badges";
import { type Executor } from "@/lib/platform/db";
import { getDirectoryUser } from "@/lib/platform/directory";
import { getDiscordSyncConfig, getTsBadgeGroups } from "@/lib/platform/env";
import { getEconomy } from "@/lib/platform/economy";
import { translate } from "@/lib/platform/i18n-core";
import { enqueueJob } from "@/lib/platform/jobs";
import { levelForXp } from "@/lib/platform/levels";
import { createNotification } from "@/lib/platform/notifications";
import { emitPlatformEvent } from "@/lib/platform/outbox";
import { berlinDay } from "@/lib/platform/time";
import { bookTransaction, PLATFORM_LEDGER_APP } from "@/lib/platform/wallet";

export const PLATFORM_APP = "platform";

/** Ensures and locks the progress row for `sub` (FOR UPDATE). */
export async function lockProgress(db: Executor, sub: string): Promise<{ xp: number; level: number }> {
  await db.insert(platformUserProgress).values({ sub }).onConflictDoNothing();
  const [row] = await db
    .select({ xp: platformUserProgress.xp, level: platformUserProgress.level })
    .from(platformUserProgress)
    .where(eq(platformUserProgress.sub, sub))
    .for("update");
  return row;
}

/** Locks several users in a stable order (avoids deadlocks). */
export async function lockProgressMany(db: Executor, subs: string[]): Promise<void> {
  for (const sub of [...new Set(subs)].sort()) await lockProgress(db, sub);
}

export async function incrementStat(
  db: Executor,
  sub: string,
  key: string,
  by: number
): Promise<{ before: number; after: number }> {
  const [row] = await db
    .insert(platformUserStats)
    .values({ sub, key, value: by })
    .onConflictDoUpdate({
      target: [platformUserStats.sub, platformUserStats.key],
      set: { value: sql`${platformUserStats.value} + ${by}`, updatedAt: new Date() },
    })
    .returning({ value: platformUserStats.value });
  return { before: row.value - by, after: row.value };
}

export async function setStat(db: Executor, sub: string, key: string, value: number): Promise<void> {
  await db
    .insert(platformUserStats)
    .values({ sub, key, value })
    .onConflictDoUpdate({
      target: [platformUserStats.sub, platformUserStats.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function getStats(db: Executor, sub: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: platformUserStats.key, value: platformUserStats.value })
    .from(platformUserStats)
    .where(eq(platformUserStats.sub, sub));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Adds `amount` to a per-user, per-Europe/Berlin-day counter without exceeding `cap`.
 * Returns how much was actually added.
 */
export async function addToDailyCounter(
  db: Executor,
  sub: string,
  counter: string,
  amount: number,
  cap: number,
  now: Date
): Promise<number> {
  if (amount <= 0 || cap <= 0) return 0;
  const day = berlinDay(now);
  await db.insert(platformDailyCounters).values({ sub, day, counter, value: 0 }).onConflictDoNothing();
  const [row] = await db
    .select({ value: platformDailyCounters.value })
    .from(platformDailyCounters)
    .where(and(eq(platformDailyCounters.sub, sub), eq(platformDailyCounters.day, day), eq(platformDailyCounters.counter, counter)))
    .for("update");
  const granted = Math.max(0, Math.min(amount, cap - row.value));
  if (granted > 0) {
    await db
      .update(platformDailyCounters)
      .set({ value: row.value + granted })
      .where(and(eq(platformDailyCounters.sub, sub), eq(platformDailyCounters.day, day), eq(platformDailyCounters.counter, counter)));
  }
  return granted;
}

/** Adds XP. App XP is capped per app and day; badge XP (`capped: false`) is not. Returns granted XP. */
export async function addXp(
  db: Executor,
  sub: string,
  amount: number,
  options: { app: string; capped: boolean; now: Date }
): Promise<number> {
  if (amount <= 0) return 0;
  const granted = options.capped
    ? await addToDailyCounter(db, sub, `xp:${options.app}`, amount, getEconomy().xpDailyCapPerApp, options.now)
    : amount;
  if (granted > 0) {
    await db
      .update(platformUserProgress)
      .set({ xp: sql`${platformUserProgress.xp} + ${granted}`, updatedAt: options.now })
      .where(eq(platformUserProgress.sub, sub));
  }
  return granted;
}

async function userLocale(db: Executor, sub: string): Promise<string> {
  return (await getDirectoryUser(db, sub))?.locale ?? "de";
}

async function enqueueBadgeSync(db: Executor, sub: string, badgeKey: string): Promise<void> {
  if (getDiscordSyncConfig()?.roles[badgeKey]) {
    await enqueueJob(db, {
      type: "badge.sync.discord",
      payload: { sub, badge: badgeKey },
      dedupeKey: `discord:${sub}:${badgeKey}`,
      sub,
    });
  }
  if (getTsBadgeGroups()[badgeKey]) {
    await enqueueJob(db, {
      type: "badge.sync.teamspeak",
      payload: { sub, badge: badgeKey },
      dedupeKey: `teamspeak:${sub}:${badgeKey}`,
      sub,
    });
  }
}

/** Awards a badge once (PK on sub+badge). Grants its XP and credits, notifies, emits badge.earned. */
export async function awardBadge(
  db: Executor,
  sub: string,
  badge: BadgeDefinition,
  options: { now: Date; sourceEventId?: string | null }
): Promise<boolean> {
  const inserted = await db
    .insert(platformUserBadges)
    .values({
      sub,
      badgeKey: badge.key,
      earnedAt: options.now,
      xp: badge.xp,
      credits: badge.credits,
      sourceEventId: options.sourceEventId ?? null,
    })
    .onConflictDoNothing()
    .returning({ key: platformUserBadges.badgeKey });
  if (!inserted.length) return false;

  await addXp(db, sub, badge.xp, { app: PLATFORM_APP, capped: false, now: options.now });
  const locale = await userLocale(db, sub);
  const title = badge.title[locale === "en" ? "en" : "de"];
  if (badge.credits > 0) {
    await bookTransaction(db, {
      sub,
      app: PLATFORM_LEDGER_APP,
      idempotencyKey: `badge:${badge.key}:${sub}`,
      kind: "reward",
      amount: badge.credits,
      reason: `Abzeichen: ${badge.title.de}`,
      ref: badge.key,
      now: options.now,
    });
  }
  await createNotification(db, {
    sub,
    app: PLATFORM_APP,
    type: "badge",
    title: translate(locale, "notificationTexts.badgeTitle", { badge: title }),
    body: translate(locale, "notificationTexts.badgeBody", { xp: badge.xp, credits: badge.credits }),
    url: "/abzeichen",
    icon: badge.icon,
    now: options.now,
  });
  await emitPlatformEvent(db, {
    type: "badge.earned",
    sub,
    data: { badge: badge.key, title, xp: badge.xp, credits: badge.credits },
    now: options.now,
  });
  await enqueueBadgeSync(db, sub, badge.key);
  return true;
}

export async function getEarnedBadgeKeys(db: Executor, sub: string): Promise<Set<string>> {
  const rows = await db
    .select({ key: platformUserBadges.badgeKey })
    .from(platformUserBadges)
    .where(eq(platformUserBadges.sub, sub));
  return new Set(rows.map((r) => r.key));
}

/**
 * Re-evaluates badge rules and the level for `sub` (call after stats changed, with the progress
 * row locked). Emits `level.up` + a notification when the level increased.
 */
export async function settleProgress(
  db: Executor,
  sub: string,
  options: { now: Date; sourceEventId?: string | null }
): Promise<{ newBadges: string[]; level: number; leveledUp: boolean }> {
  const stats = await getStats(db, sub);
  const user = await getDirectoryUser(db, sub);
  const earned = await getEarnedBadgeKeys(db, sub);
  const newBadges: string[] = [];
  for (const badge of newlyEarnedBadges({ stats, accountCreatedAt: user?.authCreatedAt ?? null }, earned)) {
    if (await awardBadge(db, sub, badge, options)) newBadges.push(badge.key);
  }

  const [progress] = await db
    .select({ xp: platformUserProgress.xp, level: platformUserProgress.level })
    .from(platformUserProgress)
    .where(eq(platformUserProgress.sub, sub));
  if (!progress) return { newBadges, level: 1, leveledUp: false };
  const level = levelForXp(progress.xp);
  if (level <= progress.level) return { newBadges, level: progress.level, leveledUp: false };

  await db
    .update(platformUserProgress)
    .set({ level, updatedAt: options.now })
    .where(eq(platformUserProgress.sub, sub));
  const locale = user?.locale ?? "de";
  await createNotification(db, {
    sub,
    app: PLATFORM_APP,
    type: "level",
    title: translate(locale, "notificationTexts.levelTitle", { level }),
    body: translate(locale, "notificationTexts.levelBody"),
    url: user?.username ? `/u/${user.username}` : "/abzeichen",
    icon: "Star",
    now: options.now,
  });
  await emitPlatformEvent(db, { type: "level.up", sub, data: { level }, now: options.now });
  return { newBadges, level, leveledUp: true };
}
