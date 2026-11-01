/**
 * Notifications (contract §5). Each creation also queues the `notification.created` webhook and,
 * when the user enabled push for that category, a web push job.
 */
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { platformNotifications, platformNotificationSettings, platformPushSubscriptions } from "@/db/platform-schema";
import { type Executor } from "@/lib/platform/db";
import { getWebPushConfig } from "@/lib/platform/env";
import { enqueueJob } from "@/lib/platform/jobs";
import { emitPlatformEvent } from "@/lib/platform/outbox";

export const NOTIFICATION_CATEGORIES = ["social", "invite", "achievement", "wallet", "app"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export function categoryForType(type: string): NotificationCategory {
  if (type === "friend_request" || type === "friend_accepted" || type.startsWith("friend")) return "social";
  if (type === "invite") return "invite";
  if (type === "badge" || type === "level" || type === "achievement") return "achievement";
  if (type.startsWith("wallet")) return "wallet";
  return "app";
}

export type CategorySettings = { inApp: boolean; push: boolean };
export type NotificationSettings = Record<NotificationCategory, CategorySettings>;

export function defaultNotificationSettings(): NotificationSettings {
  return Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, { inApp: true, push: true }])) as NotificationSettings;
}

export async function getNotificationSettings(db: Executor, sub: string): Promise<NotificationSettings> {
  const settings = defaultNotificationSettings();
  const rows = await db.select().from(platformNotificationSettings).where(eq(platformNotificationSettings.sub, sub));
  for (const row of rows) {
    if ((NOTIFICATION_CATEGORIES as readonly string[]).includes(row.category)) {
      settings[row.category as NotificationCategory] = { inApp: row.inApp, push: row.push };
    }
  }
  return settings;
}

export async function updateNotificationSettings(
  db: Executor,
  sub: string,
  patch: Partial<Record<NotificationCategory, Partial<CategorySettings>>>
): Promise<NotificationSettings> {
  const current = await getNotificationSettings(db, sub);
  for (const category of NOTIFICATION_CATEGORIES) {
    const change = patch[category];
    if (!change) continue;
    const next = { ...current[category], ...change };
    await db
      .insert(platformNotificationSettings)
      .values({ sub, category, inApp: next.inApp, push: next.push })
      .onConflictDoUpdate({
        target: [platformNotificationSettings.sub, platformNotificationSettings.category],
        set: { inApp: next.inApp, push: next.push, updatedAt: new Date() },
      });
    current[category] = next;
  }
  return current;
}

/** Relative paths ("/freunde") or absolute http(s) URLs only. */
export function isSafeUrl(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//") && !value.startsWith("/\\");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type CreateNotificationInput = {
  sub: string;
  app: string;
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  icon?: string | null;
  actorSub?: string | null;
  now?: Date;
};

export async function createNotification(db: Executor, input: CreateNotificationInput): Promise<{ id: string }> {
  const now = input.now ?? new Date();
  const settings = (await getNotificationSettings(db, input.sub))[categoryForType(input.type)];
  const [row] = await db
    .insert(platformNotifications)
    .values({
      sub: input.sub,
      app: input.app,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      url: input.url ?? null,
      icon: input.icon ?? null,
      actorSub: input.actorSub ?? null,
      // Muted categories are stored as already read: visible in the list, never counted or pushed.
      readAt: settings.inApp ? null : now,
      createdAt: now,
    })
    .returning({ id: platformNotifications.id });

  await emitPlatformEvent(db, {
    type: "notification.created",
    sub: input.sub,
    data: { id: row.id, title: input.title, url: input.url ?? null },
    now,
  });

  if (settings.inApp && settings.push && getWebPushConfig()) {
    const hasDevice = await db
      .select({ id: platformPushSubscriptions.id })
      .from(platformPushSubscriptions)
      .where(eq(platformPushSubscriptions.sub, input.sub))
      .limit(1);
    if (hasDevice.length) {
      await enqueueJob(db, { type: "push.send", payload: { notificationId: row.id }, sub: input.sub, runAt: now });
    }
  }
  return { id: row.id };
}

export type NotificationItem = {
  id: string;
  app: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  icon: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listNotifications(
  db: Executor,
  sub: string,
  options: { unread?: boolean; limit?: number; before?: string | null } = {}
): Promise<NotificationItem[]> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const conditions = [eq(platformNotifications.sub, sub)];
  if (options.unread) conditions.push(isNull(platformNotifications.readAt));
  if (options.before) {
    const cursor = await db
      .select({ createdAt: platformNotifications.createdAt })
      .from(platformNotifications)
      .where(and(eq(platformNotifications.id, options.before), eq(platformNotifications.sub, sub)))
      .limit(1);
    if (cursor[0]) conditions.push(lt(platformNotifications.createdAt, cursor[0].createdAt));
  }
  const rows = await db
    .select()
    .from(platformNotifications)
    .where(and(...conditions))
    .orderBy(desc(platformNotifications.createdAt), desc(platformNotifications.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    app: r.app,
    type: r.type,
    title: r.title,
    body: r.body,
    url: r.url,
    icon: r.icon,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function unreadCount(db: Executor, sub: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(platformNotifications)
    .where(and(eq(platformNotifications.sub, sub), isNull(platformNotifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function markRead(
  db: Executor,
  sub: string,
  input: { ids?: string[]; all?: boolean },
  now: Date = new Date()
): Promise<number> {
  if (input.all) {
    await db
      .update(platformNotifications)
      .set({ readAt: now })
      .where(and(eq(platformNotifications.sub, sub), isNull(platformNotifications.readAt)));
  } else if (input.ids?.length) {
    await db
      .update(platformNotifications)
      .set({ readAt: now })
      .where(
        and(
          eq(platformNotifications.sub, sub),
          inArray(platformNotifications.id, input.ids),
          isNull(platformNotifications.readAt)
        )
      );
  }
  return unreadCount(db, sub);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Drops notifications older than `days` (worker housekeeping). */
export async function pruneNotifications(db: Executor, days = 180): Promise<void> {
  await db
    .delete(platformNotifications)
    .where(lt(platformNotifications.createdAt, sql`now() - make_interval(days => ${days})`));
}
