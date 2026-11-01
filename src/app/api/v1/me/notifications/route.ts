import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { json, parseQuery, sessionRoute } from "@/lib/platform/http";
import { listNotifications, unreadCount, UUID_PATTERN } from "@/lib/platform/notifications";

const schema = z.object({
  unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().regex(UUID_PATTERN).optional(),
});

export const GET = sessionRoute(async (_req, { user, url }) => {
  const query = parseQuery(url, schema);
  const items = await listNotifications(platformDb, user.sub, {
    unread: query.unread === "true",
    limit: query.limit ?? 30,
    before: query.before,
  });
  return json({ items, unreadCount: await unreadCount(platformDb, user.sub) });
});
