import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { json, parseBody, signedRoute } from "@/lib/platform/http";
import { markRead, UUID_PATTERN } from "@/lib/platform/notifications";

const markReadSchema = z
  .object({
    ids: z.array(z.string().regex(UUID_PATTERN)).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, "ids or all is required");

/** POST /api/v1/users/{sub}/notifications/read {ids?|all?} → { unreadCount } */
export const POST = signedRoute<{ sub: string }>(async (_req, { params, rawBody }) => {
  const user = await requireUser(platformDb, params.sub, { createStub: false });
  const body = parseBody(rawBody, markReadSchema);
  return json({ unreadCount: await markRead(platformDb, user.sub, body) });
});
