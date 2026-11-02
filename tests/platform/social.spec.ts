import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { closeDatabase, ctx, resetDatabase, seedUser, signedRequest, uuid } from "./helpers";
import { POST as accept } from "../../src/app/api/v1/friends/requests/[id]/accept/route";
import { POST as decline } from "../../src/app/api/v1/friends/requests/[id]/decline/route";
import { POST as request } from "../../src/app/api/v1/friends/requests/route";
import { POST as remove } from "../../src/app/api/v1/friends/remove/route";
import { POST as invite } from "../../src/app/api/v1/invites/route";
import { POST as notify } from "../../src/app/api/v1/notifications/route";
import { DELETE as delPresence, PUT as putPresence } from "../../src/app/api/v1/presence/[sub]/route";
import { GET as getPresenceRoute } from "../../src/app/api/v1/presence/route";
import { GET as friendsOf } from "../../src/app/api/v1/users/[sub]/friends/route";
import { GET as countRoute } from "../../src/app/api/v1/users/[sub]/notifications/count/route";
import { POST as readRoute } from "../../src/app/api/v1/users/[sub]/notifications/read/route";
import { GET as listRoute } from "../../src/app/api/v1/users/[sub]/notifications/route";
import { platformOutbox, platformUserBadges } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { createNotification, updateNotificationSettings, unreadCount } from "../../src/lib/platform/notifications";
import { expirePresence, getPresence, setPresence } from "../../src/lib/platform/presence";
import { getStats } from "../../src/lib/platform/progress";

beforeEach(resetDatabase);
after(closeDatabase);

async function call(handler: (req: Request, c: never) => Promise<Response>, req: Request, params: Record<string, string> = {}) {
  const res = await handler(req, ctx(params) as never);
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

test("friend requests: by username, auto-accept on reverse, rules and friend.added", async () => {
  const a = uuid();
  const b = uuid();
  const c = uuid();
  await seedUser(a, "Alpha");
  await seedUser(b, "Bravo");
  await seedUser(c, "Charlie");

  let res = await call(request, await signedRequest("play", "POST", "/api/v1/friends/requests", { from: a, to: "bravo" }));
  assert.equal(res.body.status, "pending");
  const id = res.body.id as string;
  // Same request again returns the open one.
  res = await call(request, await signedRequest("play", "POST", "/api/v1/friends/requests", { from: a, to: b }));
  assert.equal(res.body.id, id);

  res = await call(request, await signedRequest("play", "POST", "/api/v1/friends/requests", { from: a, to: "alpha" }));
  assert.equal(res.body.error, "self_request");
  res = await call(request, await signedRequest("play", "POST", "/api/v1/friends/requests", { from: a, to: "nobody" }));
  assert.equal(res.status, 404);

  // b sees it as incoming and a third party cannot accept it.
  res = await call(friendsOf, await signedRequest("play", "GET", `/api/v1/users/${b}/friends`), { sub: b });
  assert.equal((res.body.incoming as unknown[]).length, 1);
  res = await call(accept, await signedRequest("play", "POST", `/api/v1/friends/requests/${id}/accept`, { sub: c }), { id });
  assert.equal(res.status, 403);

  // Reverse request auto-accepts.
  res = await call(request, await signedRequest("saga", "POST", "/api/v1/friends/requests", { from: b, to: a }));
  assert.deepEqual(res.body, { id, status: "accepted" });
  res = await call(request, await signedRequest("saga", "POST", "/api/v1/friends/requests", { from: b, to: a }));
  assert.equal(res.body.error, "already_friends");

  // c → a, a accepts.
  res = await call(request, await signedRequest("play", "POST", "/api/v1/friends/requests", { from: c, to: a }));
  const id2 = res.body.id as string;
  res = await call(accept, await signedRequest("play", "POST", `/api/v1/friends/requests/${id2}/accept`, { sub: a }), { id: id2 });
  assert.equal(res.body.status, "accepted");

  res = await call(friendsOf, await signedRequest("play", "GET", `/api/v1/users/${a}/friends`), { sub: a });
  const friends = res.body.friends as { sub: string; username: string; presence: unknown }[];
  assert.deepEqual(friends.map((f) => f.username).sort(), ["Bravo", "Charlie"]);
  assert.equal((await getStats(platformDb, a))["tretu.friends"], 2);
  const firstFriendBadge = await platformDb
    .select()
    .from(platformUserBadges)
    .where(and(eq(platformUserBadges.sub, a), eq(platformUserBadges.badgeKey, "friends-1")));
  assert.equal(firstFriendBadge.length, 1);

  const added = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.type, "friend.added"));
  assert.equal(added.length, 2 * 2 * 4); // 2 friendships × both users × 4 receiving apps (2 of them parked, no webhook)

  // Decline / withdraw.
  const d = uuid();
  await seedUser(d, "Delta");
  res = await call(request, await signedRequest("play", "POST", "/api/v1/friends/requests", { from: d, to: b }));
  const id3 = res.body.id as string;
  res = await call(decline, await signedRequest("play", "POST", `/api/v1/friends/requests/${id3}/decline`, { sub: b }), { id: id3 });
  assert.equal(res.body.status, "declined");
  res = await call(accept, await signedRequest("play", "POST", `/api/v1/friends/requests/${id3}/accept`, { sub: b }), { id: id3 });
  assert.equal(res.status, 409);

  // Remove.
  res = await call(remove, await signedRequest("play", "POST", "/api/v1/friends/remove", { sub: a, friendSub: c }));
  assert.equal(res.status, 200);
  assert.equal((await getStats(platformDb, a))["tretu.friends"], 1);
  res = await call(remove, await signedRequest("play", "POST", "/api/v1/friends/remove", { sub: a, friendSub: c }));
  assert.equal(res.status, 404);
});

test("invites only between friends; they create an invite notification", async () => {
  const a = uuid();
  const b = uuid();
  await seedUser(a, "Inviter");
  await seedUser(b, "Guest");
  const body = { from: a, to: b, title: "Inviter lädt dich zu Schach ein", joinUrl: "https://play.tretu.de/r/abc" };
  let res = await call(invite, await signedRequest("play", "POST", "/api/v1/invites", body));
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "not_friends");

  const r = await call(request, await signedRequest("play", "POST", "/api/v1/friends/requests", { from: a, to: b }));
  await call(accept, await signedRequest("play", "POST", `/api/v1/friends/requests/${r.body.id}/accept`, { sub: b }), { id: r.body.id as string });

  res = await call(invite, await signedRequest("play", "POST", "/api/v1/invites", { ...body, joinUrl: "javascript:alert(1)" }));
  assert.equal(res.status, 400);
  res = await call(invite, await signedRequest("play", "POST", "/api/v1/invites", body));
  assert.equal(res.status, 200);
  const notificationId = res.body.notificationId as string;

  res = await call(listRoute, await signedRequest("play", "GET", `/api/v1/users/${b}/notifications?unread=true&limit=20`), { sub: b });
  const items = res.body.items as { id: string; type: string; app: string; url: string; body: string }[];
  const inv = items.find((i) => i.id === notificationId);
  assert.ok(inv);
  assert.equal(inv.type, "invite");
  assert.equal(inv.app, "play");
  assert.equal(inv.url, body.joinUrl);
  assert.equal(inv.body, "Einladung von Inviter");
});

test("notifications: create, count, mark read, muted categories, notification.created", async () => {
  const a = uuid();
  await seedUser(a, "Reader");
  let res = await call(notify, await signedRequest("saga", "POST", "/api/v1/notifications", { sub: a, type: "campaign_turn", title: "Du bist dran", url: "https://saga.tretu.de/c/1" }));
  assert.equal(res.status, 200);
  const id1 = res.body.id as string;
  res = await call(notify, await signedRequest("saga", "POST", "/api/v1/notifications", { sub: a, type: "x", title: "Zwei", url: "//evil.example" }));
  assert.equal(res.status, 400);
  await call(notify, await signedRequest("saga", "POST", "/api/v1/notifications", { sub: a, type: "x", title: "Zwei" }));

  res = await call(countRoute, await signedRequest("saga", "GET", `/api/v1/users/${a}/notifications/count`), { sub: a });
  assert.deepEqual(res.body, { unreadCount: 2 });
  res = await call(readRoute, await signedRequest("saga", "POST", `/api/v1/users/${a}/notifications/read`, { ids: [id1] }), { sub: a });
  assert.deepEqual(res.body, { unreadCount: 1 });
  res = await call(readRoute, await signedRequest("saga", "POST", `/api/v1/users/${a}/notifications/read`, {}), { sub: a });
  assert.equal(res.status, 400);
  res = await call(readRoute, await signedRequest("saga", "POST", `/api/v1/users/${a}/notifications/read`, { all: true }), { sub: a });
  assert.deepEqual(res.body, { unreadCount: 0 });

  await updateNotificationSettings(platformDb, a, { app: { inApp: false } });
  await createNotification(platformDb, { sub: a, app: "saga", type: "news", title: "Stumm" });
  assert.equal(await unreadCount(platformDb, a), 0);

  const created = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.type, "notification.created"));
  assert.equal(created.length, 3 * 4);
  const data = created[0].payload.data as Record<string, unknown>;
  assert.deepEqual(Object.keys(data).sort(), ["id", "title", "url"]);
});

test("presence: PUT/DELETE per app, expires 120 s after the last PUT", async () => {
  const a = uuid();
  const b = uuid();
  await seedUser(a, "P1");
  let res = await call(putPresence, await signedRequest("play", "PUT", `/api/v1/presence/${a}`, { status: "playing", activity: "Schach", joinUrl: "https://play.tretu.de/r/1" }), { sub: a });
  assert.equal(res.status, 204);
  res = await call(putPresence, await signedRequest("saga", "PUT", `/api/v1/presence/${a}`, { status: "online" }), { sub: a });
  assert.equal(res.status, 204);
  res = await call(putPresence, await signedRequest("saga", "PUT", `/api/v1/presence/${a}`, { status: "away" }), { sub: a });
  assert.equal(res.status, 400);

  res = await call(getPresenceRoute, await signedRequest("saga", "GET", `/api/v1/presence?subs=${a},${b}`));
  const presence = res.body.presence as Record<string, { app: string; status: string; activity: string; joinUrl: string }>;
  assert.equal(presence[a].app, "play"); // "playing" wins over "online"
  assert.equal(presence[a].activity, "Schach");
  assert.equal(presence[b], undefined);

  res = await call(delPresence, await signedRequest("play", "DELETE", `/api/v1/presence/${a}`), { sub: a });
  assert.equal(res.status, 204);
  assert.equal((await getPresence(platformDb, [a]))[a].app, "saga");

  const t0 = new Date("2020-01-01T12:00:00Z");
  await setPresence(platformDb, b, "hollowmere", { status: "online" }, t0);
  assert.ok((await getPresence(platformDb, [b], new Date(t0.getTime() + 119_000)))[b]);
  assert.equal((await getPresence(platformDb, [b], new Date(t0.getTime() + 120_000)))[b], undefined);
  // A refresh extends it.
  await setPresence(platformDb, b, "hollowmere", { status: "online" }, new Date(t0.getTime() + 60_000));
  assert.ok((await getPresence(platformDb, [b], new Date(t0.getTime() + 170_000)))[b]);
  assert.equal(await expirePresence(platformDb, new Date(t0.getTime() + 181_000)), 1);
});
