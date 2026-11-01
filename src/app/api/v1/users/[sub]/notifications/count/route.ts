import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { json, signedRoute } from "@/lib/platform/http";
import { unreadCount } from "@/lib/platform/notifications";

/** GET /api/v1/users/{sub}/notifications/count → { unreadCount } */
export const GET = signedRoute<{ sub: string }>(async (_req, { params }) => {
  const user = await requireUser(platformDb, params.sub, { createStub: false });
  return json({ unreadCount: await unreadCount(platformDb, user.sub) });
});
