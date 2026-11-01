import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { listFriends, sendFriendRequest } from "@/lib/platform/friends";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";

export const GET = sessionRoute(async (_req, { user }) => json(await listFriends(platformDb, user.sub)));

const schema = z.object({ to: z.string().trim().min(1).max(128) });

/** POST /api/v1/me/friends {to: username} → { id, status } */
export const POST = sessionRoute(async (_req, { user, rawBody }) => {
  const body = parseBody(rawBody, schema);
  return json(await sendFriendRequest(platformDb, user.sub, body.to));
});
