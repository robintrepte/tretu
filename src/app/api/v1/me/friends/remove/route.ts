import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { removeFriend } from "@/lib/platform/friends";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";

const schema = z.object({ friendSub: z.string().min(1).max(128) });

export const POST = sessionRoute(async (_req, { user, rawBody }) => {
  const body = parseBody(rawBody, schema);
  await removeFriend(platformDb, user.sub, body.friendSub);
  return json({ ok: true });
});
