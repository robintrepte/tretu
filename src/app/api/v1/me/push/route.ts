import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { getWebPushConfig } from "@/lib/platform/env";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";
import { countPushSubscriptions, deletePushSubscription, pushSubscriptionSchema, savePushSubscription } from "@/lib/platform/push";

/** GET /api/v1/me/push → { enabled, publicKey, devices } */
export const GET = sessionRoute(async (_req, { user }) => {
  const config = getWebPushConfig();
  return json({
    enabled: Boolean(config),
    publicKey: config?.publicKey ?? null,
    devices: await countPushSubscriptions(platformDb, user.sub),
  });
});

/** POST /api/v1/me/push — the browser's PushSubscription JSON. */
export const POST = sessionRoute(async (req, { user, rawBody }) => {
  if (!getWebPushConfig()) return json({ error: "push_not_configured" }, 409);
  const body = parseBody(rawBody, pushSubscriptionSchema);
  await savePushSubscription(platformDb, user.sub, body, req.headers.get("user-agent"));
  return json({ ok: true });
});

const removeSchema = z.object({ endpoint: z.string().max(2000).optional() });

/** DELETE /api/v1/me/push {endpoint?} — this device, or all devices. */
export const DELETE = sessionRoute(async (_req, { user, rawBody }) => {
  const body = parseBody(rawBody, removeSchema);
  await deletePushSubscription(platformDb, user.sub, body.endpoint);
  return json({ ok: true });
});
