/**
 * Web push (VAPID). Off unless WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY and WEB_PUSH_SUBJECT are set.
 * The browser registers /platform-sw.js and sends its PushSubscription to /api/v1/me/push.
 */
import { and, eq, sql } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";

import { platformNotifications, platformPushSubscriptions } from "@/db/platform-schema";
import { type Executor } from "@/lib/platform/db";
import { getPlatformBaseUrl, getWebPushConfig } from "@/lib/platform/env";
import type { JobOutcome, JobRow } from "@/lib/platform/jobs";

export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function savePushSubscription(
  db: Executor,
  sub: string,
  input: z.infer<typeof pushSubscriptionSchema>,
  userAgent: string | null
): Promise<void> {
  const values = {
    sub,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? null,
    failureCount: 0,
  };
  await db
    .insert(platformPushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: platformPushSubscriptions.endpoint, set: values });
}

export async function deletePushSubscription(db: Executor, sub: string, endpoint?: string): Promise<void> {
  await db
    .delete(platformPushSubscriptions)
    .where(
      endpoint
        ? and(eq(platformPushSubscriptions.sub, sub), eq(platformPushSubscriptions.endpoint, endpoint))
        : eq(platformPushSubscriptions.sub, sub)
    );
}

export async function countPushSubscriptions(db: Executor, sub: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(platformPushSubscriptions)
    .where(eq(platformPushSubscriptions.sub, sub));
  return Number(row?.n ?? 0);
}

function absolute(url: string | null): string {
  const base = getPlatformBaseUrl();
  if (!url) return `${base}/benachrichtigungen`;
  return url.startsWith("/") ? `${base}${url}` : url;
}

type Sender = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions
) => Promise<{ statusCode: number }>;

/** Worker job `push.send` {notificationId}: sends to every device of the user. */
export async function sendPushJob(db: Executor, job: JobRow, sender: Sender = webpush.sendNotification): Promise<JobOutcome> {
  const config = getWebPushConfig();
  if (!config) return { status: "done" };
  const notificationId = String(job.payload.notificationId ?? "");
  const [notification] = await db
    .select()
    .from(platformNotifications)
    .where(eq(platformNotifications.id, notificationId))
    .limit(1);
  if (!notification || notification.readAt) return { status: "done" };

  const devices = await db
    .select()
    .from(platformPushSubscriptions)
    .where(eq(platformPushSubscriptions.sub, notification.sub));
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body ?? "",
    url: absolute(notification.url),
    tag: notification.id,
    icon: "/logo.svg",
  });

  let retryable = 0;
  for (const device of devices) {
    try {
      await sender({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, {
        TTL: 3600,
        timeout: 5000,
        urgency: "normal",
        vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      });
      await db
        .update(platformPushSubscriptions)
        .set({ lastSuccessAt: new Date(), failureCount: 0 })
        .where(eq(platformPushSubscriptions.id, device.id));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410 || device.failureCount >= 20) {
        await db.delete(platformPushSubscriptions).where(eq(platformPushSubscriptions.id, device.id));
      } else {
        retryable++;
        await db
          .update(platformPushSubscriptions)
          .set({ failureCount: device.failureCount + 1 })
          .where(eq(platformPushSubscriptions.id, device.id));
      }
    }
  }
  // Only retry when every device failed transiently (avoids duplicate pushes on healthy devices).
  return retryable > 0 && retryable === devices.length ? { status: "retry", error: "push delivery failed" } : { status: "done" };
}
