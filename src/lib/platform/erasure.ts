/**
 * `user.deleted` (from auth): erase every platform record of a sub and forward the event to all
 * subscribed apps. The wallet account and its ledger entries are anonymised instead of deleted so
 * the double-entry ledger keeps balancing to zero; nothing left behind is linkable to the person.
 * Discord roles and TeamSpeak server groups granted for badges are captured first and queued for
 * removal (or handed to the surviving account of a merge with the same identity), see badge-sync.ts.
 */
import { randomUUID } from "node:crypto";

import { eq, or, sql } from "drizzle-orm";

import {
  platformBadgeRevocations,
  platformBadgeSync,
  platformDailyCounters,
  platformDeletedUsers,
  platformEvents,
  platformFriendRequests,
  platformFriendships,
  platformJobs,
  platformNotifications,
  platformNotificationSettings,
  platformOutbox,
  platformPresence,
  platformProfileSettings,
  platformPushSubscriptions,
  platformTsLinks,
  platformUserAchievements,
  platformUserApps,
  platformUserBadges,
  platformUserProgress,
  platformUsers,
  platformUserStats,
  platformWalletAccounts,
  platformWalletDaily,
  platformWalletTransactions,
} from "@/db/platform-schema";
import { releaseGrantsForErasure } from "@/lib/platform/badge-sync";
import { type Executor } from "@/lib/platform/db";
import { emitPlatformEvent } from "@/lib/platform/outbox";

export async function eraseUser(
  tx: Executor,
  sub: string,
  now: Date = new Date(),
  options: { mergedInto?: string | null } = {}
): Promise<void> {
  // Must run before the directory row, TS link and sync state are deleted below.
  await releaseGrantsForErasure(tx, sub, options.mergedInto ?? null);
  await tx.insert(platformDeletedUsers).values({ sub, deletedAt: now }).onConflictDoNothing();

  // Friends lose this friendship: recount their friend stat.
  const friendships = await tx
    .delete(platformFriendships)
    .where(or(eq(platformFriendships.subA, sub), eq(platformFriendships.subB, sub)))
    .returning();
  const friendSubs = friendships.map((f) => (f.subA === sub ? f.subB : f.subA));
  for (const friend of friendSubs) {
    await tx.execute(sql`
      update platform_user_stats set value = (
        select count(*) from platform_friendships where sub_a = ${friend} or sub_b = ${friend}
      ), updated_at = now()
      where sub = ${friend} and key = 'tretu.friends'`);
  }

  await tx
    .delete(platformFriendRequests)
    .where(or(eq(platformFriendRequests.fromSub, sub), eq(platformFriendRequests.toSub, sub)));
  await tx.delete(platformPresence).where(eq(platformPresence.sub, sub));
  await tx
    .delete(platformNotifications)
    .where(or(eq(platformNotifications.sub, sub), eq(platformNotifications.actorSub, sub)));
  await tx.delete(platformNotificationSettings).where(eq(platformNotificationSettings.sub, sub));
  await tx.delete(platformPushSubscriptions).where(eq(platformPushSubscriptions.sub, sub));
  await tx.delete(platformProfileSettings).where(eq(platformProfileSettings.sub, sub));
  await tx.delete(platformTsLinks).where(eq(platformTsLinks.sub, sub));
  await tx.delete(platformBadgeSync).where(eq(platformBadgeSync.sub, sub));
  await tx.delete(platformUserBadges).where(eq(platformUserBadges.sub, sub));
  await tx.delete(platformBadgeRevocations).where(eq(platformBadgeRevocations.sub, sub));
  await tx.delete(platformUserAchievements).where(eq(platformUserAchievements.sub, sub));
  await tx.delete(platformUserStats).where(eq(platformUserStats.sub, sub));
  await tx.delete(platformUserProgress).where(eq(platformUserProgress.sub, sub));
  await tx.delete(platformDailyCounters).where(eq(platformDailyCounters.sub, sub));
  await tx.delete(platformUserApps).where(eq(platformUserApps.sub, sub));
  await tx.delete(platformWalletDaily).where(eq(platformWalletDaily.sub, sub));
  await tx.delete(platformJobs).where(eq(platformJobs.sub, sub));
  await tx.delete(platformOutbox).where(eq(platformOutbox.sub, sub));
  await tx.update(platformEvents).set({ sub: null, data: {} }).where(eq(platformEvents.sub, sub));

  // Wallet: anonymise (keeps the ledger balanced).
  await tx
    .update(platformWalletAccounts)
    .set({ owner: `erased:${randomUUID()}`, sub: null, kind: "erased", updatedAt: now })
    .where(eq(platformWalletAccounts.sub, sub));
  await tx
    .update(platformWalletTransactions)
    .set({
      sub: null,
      reason: null,
      ref: null,
      idempotencyKey: sql`'erased:' || ${platformWalletTransactions.id}::text`,
    })
    .where(eq(platformWalletTransactions.sub, sub));

  await tx.delete(platformUsers).where(eq(platformUsers.sub, sub));

  await emitPlatformEvent(tx, { type: "user.deleted", sub, data: {}, exceptApps: ["auth"], now });
}
