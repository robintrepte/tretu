import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { listFriends } from "@/lib/platform/friends";
import { json, signedRoute } from "@/lib/platform/http";

/** GET /api/v1/users/{sub}/friends → { friends, incoming, outgoing } */
export const GET = signedRoute<{ sub: string }>(async (_req, { params }) => {
  const user = await requireUser(platformDb, params.sub, { createStub: false });
  return json(await listFriends(platformDb, user.sub));
});
