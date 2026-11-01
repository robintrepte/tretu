import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { json, parseQuery, signedRoute } from "@/lib/platform/http";
import { listNotifications, unreadCount, UUID_PATTERN } from "@/lib/platform/notifications";

const querySchema = z.object({
  unread: z.enum(["true", "false", "1", "0"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().regex(UUID_PATTERN).optional(),
});

/** GET /api/v1/users/{sub}/notifications?unread=true&limit=20 → { items, unreadCount } */
export const GET = signedRoute<{ sub: string }>(async (_req, { params, url }) => {
  const user = await requireUser(platformDb, params.sub, { createStub: false });
  const query = parseQuery(url, querySchema);
  const items = await listNotifications(platformDb, user.sub, {
    unread: query.unread === "true" || query.unread === "1",
    limit: query.limit ?? 20,
    before: query.before,
  });
  return json({ items, unreadCount: await unreadCount(platformDb, user.sub) });
});
