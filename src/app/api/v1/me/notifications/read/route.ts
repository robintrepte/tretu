import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";
import { markRead, UUID_PATTERN } from "@/lib/platform/notifications";

const schema = z
  .object({ ids: z.array(z.string().regex(UUID_PATTERN)).max(200).optional(), all: z.boolean().optional() })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, "ids or all is required");

export const POST = sessionRoute(async (_req, { user, rawBody }) => {
  const body = parseBody(rawBody, schema);
  return json({ unreadCount: await markRead(platformDb, user.sub, body) });
});
