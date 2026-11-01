/**
 * Friends and invites (contract §5). Friendships are mutual and stored once (subA < subB).
 * A request auto-accepts when the reverse request is pending. Invites only between friends.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { platformFriendRequests, platformFriendships, platformUsers } from "@/db/platform-schema";
import { inTransaction, type Executor } from "@/lib/platform/db";
import {
  displayName,
  ensureUser,
  findUserByUsername,
  getDirectoryUser,
  isErased,
  type DirectoryUser,
} from "@/lib/platform/directory";
import { badRequest, conflict, forbidden, notFound } from "@/lib/platform/errors";
import { translate } from "@/lib/platform/i18n-core";
import { createNotification, isSafeUrl, UUID_PATTERN } from "@/lib/platform/notifications";
import { emitPlatformEvent } from "@/lib/platform/outbox";
import { getPresence, type PresenceInfo } from "@/lib/platform/presence";
import { lockProgressMany, PLATFORM_APP, setStat, settleProgress } from "@/lib/platform/progress";

export type UserRef = { sub: string; username: string | null; name: string | null; picture: string | null };

export function toRef(user: DirectoryUser | null | undefined, sub: string): UserRef {
  return { sub, username: user?.username ?? null, name: user?.name ?? null, picture: user?.picture ?? null };
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function areFriends(db: Executor, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [subA, subB] = orderedPair(a, b);
  const rows = await db
    .select({ since: platformFriendships.since })
    .from(platformFriendships)
    .where(and(eq(platformFriendships.subA, subA), eq(platformFriendships.subB, subB)))
    .limit(1);
  return rows.length > 0;
}

export async function friendSubs(db: Executor, sub: string): Promise<{ sub: string; since: Date }[]> {
  const rows = await db
    .select()
    .from(platformFriendships)
    .where(or(eq(platformFriendships.subA, sub), eq(platformFriendships.subB, sub)));
  return rows.map((r) => ({ sub: r.subA === sub ? r.subB : r.subA, since: r.since }));
}

export async function friendCount(db: Executor, sub: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(platformFriendships)
    .where(or(eq(platformFriendships.subA, sub), eq(platformFriendships.subB, sub)));
  return Number(row?.n ?? 0);
}

async function usersBySub(db: Executor, subs: string[]): Promise<Map<string, DirectoryUser>> {
  if (!subs.length) return new Map();
  const rows = await db.select().from(platformUsers).where(inArray(platformUsers.sub, [...new Set(subs)]));
  return new Map(rows.map((r) => [r.sub, r]));
}

export type FriendsList = {
  friends: (UserRef & { since: string; presence: PresenceInfo | null })[];
  incoming: { id: string; from: UserRef; createdAt: string }[];
  outgoing: { id: string; to: UserRef; createdAt: string }[];
};

export async function listFriends(db: Executor, sub: string, now: Date = new Date()): Promise<FriendsList> {
  const friends = await friendSubs(db, sub);
  const requests = await db
    .select()
    .from(platformFriendRequests)
    .where(
      and(
        eq(platformFriendRequests.status, "pending"),
        or(eq(platformFriendRequests.fromSub, sub), eq(platformFriendRequests.toSub, sub))
      )
    )
    .orderBy(desc(platformFriendRequests.createdAt));
  const others = [...friends.map((f) => f.sub), ...requests.map((r) => (r.fromSub === sub ? r.toSub : r.fromSub))];
  const users = await usersBySub(db, others);
  const presence = await getPresence(db, friends.map((f) => f.sub), now);

  return {
    friends: friends
      .map((f) => ({ ...toRef(users.get(f.sub), f.sub), since: f.since.toISOString(), presence: presence[f.sub] ?? null }))
      .sort((a, b) => {
        const pa = a.presence ? 1 : 0;
        const pb = b.presence ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return displayName(users.get(a.sub)).localeCompare(displayName(users.get(b.sub)), "de");
      }),
    incoming: requests
      .filter((r) => r.toSub === sub)
      .map((r) => ({ id: r.id, from: toRef(users.get(r.fromSub), r.fromSub), createdAt: r.createdAt.toISOString() })),
    outgoing: requests
      .filter((r) => r.fromSub === sub)
      .map((r) => ({ id: r.id, to: toRef(users.get(r.toSub), r.toSub), createdAt: r.createdAt.toISOString() })),
  };
}

/** Resolves a sub or username to a known, non-erased user. */
export async function resolveUser(db: Executor, subOrUsername: string): Promise<DirectoryUser | null> {
  const value = subOrUsername.trim();
  if (!value) return null;
  const bySub = await getDirectoryUser(db, value);
  if (bySub) return bySub;
  const byName = await findUserByUsername(db, value);
  if (byName) return byName;
  if (UUID_PATTERN.test(value)) return ensureUser(db, value);
  return null;
}

async function updateFriendStats(tx: Executor, subs: string[], now: Date): Promise<void> {
  for (const sub of subs) {
    await setStat(tx, sub, "tretu.friends", await friendCount(tx, sub));
    await settleProgress(tx, sub, { now });
  }
}

async function makeFriends(tx: Executor, requester: string, accepter: string, now: Date): Promise<void> {
  const [subA, subB] = orderedPair(requester, accepter);
  await tx.insert(platformFriendships).values({ subA, subB, since: now }).onConflictDoNothing();
  await updateFriendStats(tx, [requester, accepter], now);
  await emitPlatformEvent(tx, { type: "friend.added", sub: requester, data: { friendSub: accepter }, now });
  await emitPlatformEvent(tx, { type: "friend.added", sub: accepter, data: { friendSub: requester }, now });
  const requesterUser = await getDirectoryUser(tx, requester);
  const accepterUser = await getDirectoryUser(tx, accepter);
  await createNotification(tx, {
    sub: requester,
    app: PLATFORM_APP,
    type: "friend_accepted",
    title: translate(requesterUser?.locale, "notificationTexts.friendAcceptedTitle", { name: displayName(accepterUser) }),
    url: "/freunde",
    icon: "UserCheck",
    actorSub: accepter,
    now,
  });
}

export async function sendFriendRequest(
  db: Executor,
  fromSub: string,
  to: string,
  now: Date = new Date()
): Promise<{ id: string; status: "pending" | "accepted" }> {
  const from = await ensureUser(db, fromSub);
  if (!from) throw notFound("user_not_found", "Sender is not a known Tretu user.");
  const target = await resolveUser(db, to);
  if (!target) throw notFound("user_not_found", "No Tretu user with that name.");
  if (target.sub === fromSub) throw badRequest("You cannot befriend yourself.", "self_request");

  return inTransaction(db, async (tx) => {
    await lockProgressMany(tx, [fromSub, target.sub]);
    if (await areFriends(tx, fromSub, target.sub)) throw conflict("already_friends", "You are already friends.");

    const pending = await tx
      .select()
      .from(platformFriendRequests)
      .where(
        and(
          eq(platformFriendRequests.status, "pending"),
          or(
            and(eq(platformFriendRequests.fromSub, fromSub), eq(platformFriendRequests.toSub, target.sub)),
            and(eq(platformFriendRequests.fromSub, target.sub), eq(platformFriendRequests.toSub, fromSub))
          )
        )
      );
    const reverse = pending.find((r) => r.fromSub === target.sub);
    if (reverse) {
      await tx
        .update(platformFriendRequests)
        .set({ status: "accepted", respondedAt: now })
        .where(eq(platformFriendRequests.id, reverse.id));
      await makeFriends(tx, target.sub, fromSub, now);
      return { id: reverse.id, status: "accepted" as const };
    }
    const same = pending.find((r) => r.fromSub === fromSub);
    if (same) return { id: same.id, status: "pending" as const };

    const [row] = await tx
      .insert(platformFriendRequests)
      .values({ fromSub, toSub: target.sub, status: "pending", createdAt: now })
      .returning({ id: platformFriendRequests.id });
    await createNotification(tx, {
      sub: target.sub,
      app: PLATFORM_APP,
      type: "friend_request",
      title: translate(target.locale, "notificationTexts.friendRequestTitle", { name: displayName(from) }),
      body: translate(target.locale, "notificationTexts.friendRequestBody"),
      url: "/freunde",
      icon: "UserPlus",
      actorSub: fromSub,
      now,
    });
    return { id: row.id, status: "pending" as const };
  });
}

async function loadPendingRequest(tx: Executor, id: string) {
  if (!UUID_PATTERN.test(id)) throw notFound("request_not_found");
  const [row] = await tx.select().from(platformFriendRequests).where(eq(platformFriendRequests.id, id)).limit(1);
  if (!row) throw notFound("request_not_found");
  return row;
}

export async function acceptFriendRequest(
  db: Executor,
  id: string,
  sub: string,
  now: Date = new Date()
): Promise<{ id: string; status: "accepted" }> {
  return inTransaction(db, async (tx) => {
    const request = await loadPendingRequest(tx, id);
    if (request.toSub !== sub) throw forbidden("forbidden", "Only the recipient can accept.");
    await lockProgressMany(tx, [request.fromSub, request.toSub]);
    const [fresh] = await tx
      .select({ status: platformFriendRequests.status })
      .from(platformFriendRequests)
      .where(eq(platformFriendRequests.id, id))
      .for("update");
    if (fresh.status === "accepted") return { id, status: "accepted" as const };
    if (fresh.status !== "pending") throw conflict("request_closed", "This request is no longer open.");
    await tx
      .update(platformFriendRequests)
      .set({ status: "accepted", respondedAt: now })
      .where(eq(platformFriendRequests.id, id));
    await makeFriends(tx, request.fromSub, request.toSub, now);
    return { id, status: "accepted" as const };
  });
}

/** Recipient declines, or the sender withdraws (cancelled). */
export async function declineFriendRequest(
  db: Executor,
  id: string,
  sub: string,
  now: Date = new Date()
): Promise<{ id: string; status: "declined" | "cancelled" }> {
  return inTransaction(db, async (tx) => {
    const request = await loadPendingRequest(tx, id);
    if (request.toSub !== sub && request.fromSub !== sub) throw forbidden();
    if (request.status !== "pending") throw conflict("request_closed", "This request is no longer open.");
    const status = request.toSub === sub ? ("declined" as const) : ("cancelled" as const);
    await tx
      .update(platformFriendRequests)
      .set({ status, respondedAt: now })
      .where(and(eq(platformFriendRequests.id, id), eq(platformFriendRequests.status, "pending")));
    return { id, status };
  });
}

export async function removeFriend(db: Executor, sub: string, friendSub: string, now: Date = new Date()): Promise<void> {
  await inTransaction(db, async (tx) => {
    await lockProgressMany(tx, [sub, friendSub]);
    const [subA, subB] = orderedPair(sub, friendSub);
    const removed = await tx
      .delete(platformFriendships)
      .where(and(eq(platformFriendships.subA, subA), eq(platformFriendships.subB, subB)))
      .returning();
    if (!removed.length) throw notFound("not_friends", "You are not friends.");
    await setStat(tx, sub, "tretu.friends", await friendCount(tx, sub));
    await setStat(tx, friendSub, "tretu.friends", await friendCount(tx, friendSub));
  });
}

export async function createInvite(
  db: Executor,
  input: { app: string; from: string; to: string; title: string; joinUrl: string; now?: Date }
): Promise<{ notificationId: string }> {
  if (!isSafeUrl(input.joinUrl)) throw badRequest("joinUrl must be an http(s) URL.");
  if ((await isErased(db, input.from)) || (await isErased(db, input.to))) throw notFound("user_not_found");
  if (!(await areFriends(db, input.from, input.to))) throw forbidden("not_friends", "Invites are only possible between friends.");
  const from = await getDirectoryUser(db, input.from);
  const to = await getDirectoryUser(db, input.to);
  const { id } = await createNotification(db, {
    sub: input.to,
    app: input.app,
    type: "invite",
    title: input.title,
    body: translate(to?.locale, "notificationTexts.inviteBody", { name: displayName(from) }),
    url: input.joinUrl,
    icon: "Send",
    actorSub: input.from,
    now: input.now,
  });
  return { notificationId: id };
}
