import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { removeFriend } from "@/lib/platform/friends";
import { json, parseBody, signedRoute } from "@/lib/platform/http";

const schema = z.object({ sub: z.string().min(1).max(128), friendSub: z.string().min(1).max(128) });

/** POST /api/v1/friends/remove {sub, friendSub} → { ok: true } */
export const POST = signedRoute(async (_req, { rawBody }) => {
  const body = parseBody(rawBody, schema);
  await removeFriend(platformDb, body.sub, body.friendSub);
  return json({ ok: true });
});
