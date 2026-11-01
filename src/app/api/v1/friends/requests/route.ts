import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { sendFriendRequest } from "@/lib/platform/friends";
import { json, parseBody, signedRoute } from "@/lib/platform/http";

const schema = z.object({ from: z.string().min(1).max(128), to: z.string().min(1).max(128) });

/** POST /api/v1/friends/requests {from, to: sub-or-username} → { id, status } */
export const POST = signedRoute(async (_req, { rawBody }) => {
  const body = parseBody(rawBody, schema);
  return json(await sendFriendRequest(platformDb, body.from, body.to));
});
