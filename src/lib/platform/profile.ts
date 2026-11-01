/** Profiles: the signed `GET /users/{sub}` shape and the data behind the /u/[username] page. */
import { desc, eq } from "drizzle-orm";

import { platformProfileSettings, platformUserBadges, platformUserProgress, platformUsers } from "@/db/platform-schema";
import { getBadge, type Locale } from "@/lib/platform/badges";
import { type Executor } from "@/lib/platform/db";
import { getDirectoryUser, isErased, type DirectoryUser } from "@/lib/platform/directory";
import { getPlatformBaseUrl } from "@/lib/platform/env";
import { areFriends, friendCount } from "@/lib/platform/friends";
import { levelInfo, type LevelInfo } from "@/lib/platform/levels";
import { getStats } from "@/lib/platform/progress";

export const VISIBILITIES = ["public", "friends", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export function profileUrl(user: Pick<DirectoryUser, "username" | "sub">): string {
  return `${getPlatformBaseUrl()}/u/${encodeURIComponent(user.username ?? user.sub)}`;
}

export async function getVisibility(db: Executor, sub: string): Promise<Visibility> {
  const [row] = await db
    .select({ visibility: platformProfileSettings.visibility })
    .from(platformProfileSettings)
    .where(eq(platformProfileSettings.sub, sub))
    .limit(1);
  return (VISIBILITIES as readonly string[]).includes(row?.visibility ?? "") ? (row!.visibility as Visibility) : "public";
}

export async function setVisibility(db: Executor, sub: string, visibility: Visibility): Promise<void> {
  await db
    .insert(platformProfileSettings)
    .values({ sub, visibility })
    .onConflictDoUpdate({ target: platformProfileSettings.sub, set: { visibility, updatedAt: new Date() } });
}

export type EarnedBadge = { key: string; title: string; description: string; icon: string; earnedAt: string };

export async function getEarnedBadges(db: Executor, sub: string, locale: Locale): Promise<EarnedBadge[]> {
  const rows = await db
    .select()
    .from(platformUserBadges)
    .where(eq(platformUserBadges.sub, sub))
    .orderBy(desc(platformUserBadges.earnedAt));
  return rows.flatMap((row) => {
    const badge = getBadge(row.badgeKey);
    if (!badge) return [];
    return [
      {
        key: badge.key,
        title: badge.title[locale],
        description: badge.description[locale],
        icon: badge.icon,
        earnedAt: row.earnedAt.toISOString(),
      },
    ];
  });
}

export async function getLevel(db: Executor, sub: string): Promise<LevelInfo> {
  const [row] = await db
    .select({ xp: platformUserProgress.xp })
    .from(platformUserProgress)
    .where(eq(platformUserProgress.sub, sub))
    .limit(1);
  return levelInfo(row?.xp ?? 0);
}

/** Contract shape of `GET /api/v1/users/{sub}` (apps see everything; privacy applies to the web pages). */
export async function getUserProfile(db: Executor, user: DirectoryUser, locale: Locale = "de") {
  const level = await getLevel(db, user.sub);
  return {
    sub: user.sub,
    username: user.username,
    name: user.name,
    picture: user.picture,
    level: level.level,
    xp: level.xp,
    xpLevelStart: level.xpLevelStart,
    xpNextLevel: level.xpNextLevel,
    badges: await getEarnedBadges(db, user.sub, locale),
    stats: await getStats(db, user.sub),
    profileUrl: profileUrl(user),
  };
}

export type ProfilePage =
  | { state: "not_found" }
  | { state: "restricted"; user: DirectoryUser; visibility: Visibility }
  | {
      state: "ok";
      user: DirectoryUser;
      isOwner: boolean;
      isFriend: boolean;
      visibility: Visibility;
      level: LevelInfo;
      badges: EarnedBadge[];
      stats: Record<string, number>;
      friends: number;
    };

export async function findProfileUser(db: Executor, usernameOrSub: string): Promise<DirectoryUser | null> {
  const value = decodeURIComponent(usernameOrSub).trim();
  const [byName] = await db.select().from(platformUsers).where(eq(platformUsers.usernameLower, value.toLowerCase())).limit(1);
  if (byName) return byName;
  if (await isErased(db, value)) return null;
  return getDirectoryUser(db, value);
}

export async function loadProfilePage(
  db: Executor,
  usernameOrSub: string,
  viewerSub: string | null,
  locale: Locale
): Promise<ProfilePage> {
  const user = await findProfileUser(db, usernameOrSub);
  if (!user) return { state: "not_found" };
  const visibility = await getVisibility(db, user.sub);
  const isOwner = viewerSub === user.sub;
  const isFriend = viewerSub ? await areFriends(db, viewerSub, user.sub) : false;
  const allowed = isOwner || visibility === "public" || (visibility === "friends" && isFriend);
  if (!allowed) return { state: "restricted", user, visibility };
  return {
    state: "ok",
    user,
    isOwner,
    isFriend,
    visibility,
    level: await getLevel(db, user.sub),
    badges: await getEarnedBadges(db, user.sub, locale),
    stats: await getStats(db, user.sub),
    friends: await friendCount(db, user.sub),
  };
}
