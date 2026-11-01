import { platformDb } from "@/lib/platform/db";
import { ensureUser } from "@/lib/platform/directory";
import { json, sessionRoute } from "@/lib/platform/http";
import { unreadCount } from "@/lib/platform/notifications";
import { getLevel, profileUrl } from "@/lib/platform/profile";
import { peekBalance } from "@/lib/platform/wallet";

/** GET /api/v1/me — summary for the signed-in user (header badge, menus). */
export const GET = sessionRoute(async (_req, { user }) => {
  const directory = await ensureUser(platformDb, user.sub);
  const level = await getLevel(platformDb, user.sub);
  return json({
    user: {
      sub: user.sub,
      name: directory?.name ?? user.name,
      image: directory?.picture ?? user.image,
      username: directory?.username ?? null,
      profileUrl: directory ? profileUrl(directory) : null,
    },
    level: level.level,
    xp: level.xp,
    unreadCount: await unreadCount(platformDb, user.sub),
    balance: await peekBalance(platformDb, user.sub),
  });
});
