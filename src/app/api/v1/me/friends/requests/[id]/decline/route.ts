import { platformDb } from "@/lib/platform/db";
import { declineFriendRequest } from "@/lib/platform/friends";
import { json, sessionRoute } from "@/lib/platform/http";

export const POST = sessionRoute<{ id: string }>(async (_req, { user, params }) =>
  json(await declineFriendRequest(platformDb, params.id, user.sub))
);
