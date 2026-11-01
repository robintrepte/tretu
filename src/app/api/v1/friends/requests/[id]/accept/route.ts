import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { acceptFriendRequest } from "@/lib/platform/friends";
import { json, parseBody, signedRoute } from "@/lib/platform/http";

const schema = z.object({ sub: z.string().min(1).max(128) });

/** POST /api/v1/friends/requests/{id}/accept {sub} → { id, status:"accepted" } */
export const POST = signedRoute<{ id: string }>(async (_req, { params, rawBody }) => {
  const body = parseBody(rawBody, schema);
  return json(await acceptFriendRequest(platformDb, params.id, body.sub));
});
