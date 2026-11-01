import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";
import { getNotificationSettings, NOTIFICATION_CATEGORIES, updateNotificationSettings } from "@/lib/platform/notifications";
import { getVisibility, setVisibility, VISIBILITIES } from "@/lib/platform/profile";

export const GET = sessionRoute(async (_req, { user }) =>
  json({
    visibility: await getVisibility(platformDb, user.sub),
    notifications: await getNotificationSettings(platformDb, user.sub),
  })
);

const categorySchema = z.object({ inApp: z.boolean().optional(), push: z.boolean().optional() });
const schema = z.object({
  visibility: z.enum(VISIBILITIES).optional(),
  notifications: z.partialRecord(z.enum(NOTIFICATION_CATEGORIES), categorySchema).optional(),
});

export const PUT = sessionRoute(async (_req, { user, rawBody }) => {
  const body = parseBody(rawBody, schema);
  if (body.visibility) await setVisibility(platformDb, user.sub, body.visibility);
  const notifications = body.notifications
    ? await updateNotificationSettings(platformDb, user.sub, body.notifications)
    : await getNotificationSettings(platformDb, user.sub);
  return json({ visibility: await getVisibility(platformDb, user.sub), notifications });
});
