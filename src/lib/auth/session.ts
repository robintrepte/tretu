import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth/auth";
import { getUserRoles } from "@/lib/permissions/checks";

/**
 * The signed-in person, as every part of tretu.de (dashboard, platform pages) sees them.
 * `id` is the local user id (`users.id`) as a string; `roles` are the local role keys
 * (`admin`, `operator`, `manager`, `user`).
 */
export type CurrentUser = {
  id: string;
  tretuSub: string | null;
  name: string;
  image: string | null;
  discordId: string | null;
  roles: string[];
};

/** Resolves the current session from the request cookies (deduplicated per request). Never throws for anonymous visitors. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session) return null;
  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;
  return {
    id: String(row.id),
    tretuSub: row.tretuSub,
    name: row.displayName,
    image: row.avatarUrl,
    discordId: row.discordId,
    roles: await getUserRoles(row.id),
  };
});

/** Like `getCurrentUser`, but redirects anonymous visitors to the login page (pages and server actions). */
export async function requireUser(callbackPath = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  return user;
}

/** Local user id of the signed-in person (string), or `null`. */
export async function getUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}
