import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { closeDatabase, ctx, envelope, resetDatabase, seedUser, signedRequest, uuid } from "./helpers";
import { POST as postEvents } from "../../src/app/api/v1/events/route";
import { GET as getUser } from "../../src/app/api/v1/users/[sub]/route";
import {
  platformEvents,
  platformNotifications,
  platformOutbox,
  platformUserBadges,
  platformUserProgress,
} from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { ingestEvents, parseEventBody } from "../../src/lib/platform/events";
import { levelForXp, xpForLevel } from "../../src/lib/platform/levels";
import { getStats } from "../../src/lib/platform/progress";
import { peekBalance } from "../../src/lib/platform/wallet";

beforeEach(resetDatabase);
after(closeDatabase);

async function send(app: string, body: unknown) {
  const res = await postEvents(await signedRequest(app, "POST", "/api/v1/events", body), ctx());
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function badgeRows(sub: string, key?: string) {
  return platformDb
    .select()
    .from(platformUserBadges)
    .where(key ? and(eq(platformUserBadges.sub, sub), eq(platformUserBadges.badgeKey, key)) : eq(platformUserBadges.sub, sub));
}

test("level curve", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(299), 2);
  assert.equal(levelForXp(300), 3);
  assert.equal(levelForXp(4500), 10);
  assert.equal(xpForLevel(5), 1000);
  for (let l = 1; l < 200; l++) assert.equal(levelForXp(xpForLevel(l)), l);
});

test("POST /events: single + batch, idempotent on id → 202 {accepted, duplicates}", async () => {
  const sub = uuid();
  await seedUser(sub, "alice");
  const first = envelope("saga", sub, "stat.increment", { key: "saga.turns", by: 3 });
  let res = await send("saga", first);
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { accepted: 1, duplicates: 0 });

  const second = envelope("saga", sub, "stat.increment", { key: "saga.turns", by: 2 });
  res = await send("saga", { events: [first, second, second] });
  assert.deepEqual(res.body, { accepted: 1, duplicates: 2 });

  const stats = await getStats(platformDb, sub);
  assert.equal(stats["saga.turns"], 5);
  assert.equal(stats["tretu.apps.used"], 1);
  const stored = await platformDb.select().from(platformEvents);
  assert.equal(stored.length, 2);
});

test("POST /events: validation (app header, key prefix, auth-only user events, batch size)", async () => {
  const sub = uuid();
  let res = await send("saga", envelope("play", sub, "stat.increment", { key: "play.x", by: 1 }));
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "app_mismatch");

  res = await send("saga", envelope("saga", sub, "stat.increment", { key: "play.wins", by: 1 }));
  assert.equal(res.body.error, "invalid_key");

  res = await send("saga", envelope("saga", sub, "stat.increment", { key: "saga.turns", by: -1 }));
  assert.equal(res.status, 400);

  res = await send("saga", envelope("saga", sub, "user.created", { username: "x" }));
  assert.equal(res.body.error, "forbidden_type");

  res = await send("play", envelope("play", sub, "game.finished", { game: "chess", result: "maybe" }));
  assert.equal(res.status, 400);

  const many = Array.from({ length: 101 }, () => envelope("saga", sub, "stat.increment", { key: "saga.turns", by: 1 }));
  res = await send("saga", { events: many });
  assert.equal(res.body.error, "batch_too_large");

  // Nothing of the rejected requests was stored.
  assert.equal((await platformDb.select().from(platformEvents)).length, 0);

  // mc-dashboard reports Minecraft stats with the `minecraft.` prefix.
  res = await send("mc-dashboard", envelope("mc-dashboard", sub, "stat.increment", { key: "minecraft.playtime.minutes", by: 30 }));
  assert.equal(res.status, 202);
  const unsigned = await postEvents(new Request("http://localhost:3020/api/v1/events", { method: "POST", body: "{}" }), ctx());
  assert.equal(unsigned.status, 401);
});

test("game.finished auto stats, sub:null stores but awards nothing", async () => {
  const sub = uuid();
  await seedUser(sub, "bob");
  await send("play", envelope("play", sub, "game.finished", { game: "Chess", result: "win", mode: "multiplayer" }));
  await send("play", envelope("play", sub, "game.finished", { game: "chess", result: "loss" }));
  await send("play", envelope("play", sub, "game.finished", { game: "maumau", result: "draw" }));
  const stats = await getStats(platformDb, sub);
  assert.equal(stats["play.games.played"], 3);
  assert.equal(stats["play.chess.played"], 2);
  assert.equal(stats["play.maumau.played"], 1);
  assert.equal(stats["play.games.won"], 1);
  assert.equal(stats["play.chess.won"], 1);
  assert.equal(stats["play.maumau.won"], undefined);

  const anon = envelope("play", null, "game.finished", { game: "chess", result: "win" });
  const res = await send("play", anon);
  assert.equal(res.status, 202);
  const [row] = await platformDb.select().from(platformEvents).where(eq(platformEvents.id, anon.id));
  assert.equal(row.status, "stored");
  assert.equal((await platformDb.select().from(platformUserProgress)).length, 1);
});

test("badge is awarded exactly once (also under concurrent events) with one-time XP + credits", async () => {
  const sub = uuid();
  await seedUser(sub, "carol");
  const wins = Array.from({ length: 12 }, () => envelope("play", sub, "game.finished", { game: "chess", result: "win" }));
  await Promise.all(wins.map((e) => send("play", e)));
  await send("play", { events: wins.slice(0, 3) }); // duplicates

  const firstWin = await badgeRows(sub, "play.first-win");
  assert.equal(firstWin.length, 1);
  assert.equal((await badgeRows(sub, "wins-10")).length, 1);

  const badgeNotifications = await platformDb
    .select()
    .from(platformNotifications)
    .where(and(eq(platformNotifications.sub, sub), eq(platformNotifications.type, "badge")));
  assert.equal(badgeNotifications.length, 2);

  // Badge credits once each (20 + 25) + win rewards capped at 25/day + welcome 500.
  assert.equal(await peekBalance(platformDb, sub), 500 + 20 + 25 + 25);

  const outbox = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.type, "badge.earned"));
  // Two badges, two subscribed apps (saga + play have webhooks).
  assert.equal(outbox.length, 4);
});

test("XP is capped per app and Europe/Berlin day; badge XP is not", async () => {
  process.env.TRETU_XP_DAILY_CAP_PER_APP = "50";
  try {
    const sub = uuid();
    await seedUser(sub, "dave");
    const day1 = new Date("2026-06-01T10:00:00Z");
    const events = Array.from({ length: 30 }, () => envelope("saga", sub, "stat.increment", { key: "saga.turns", by: 1 }));
    await ingestEvents(parseEventBody({ events }, "saga"), day1);
    let [progress] = await platformDb.select().from(platformUserProgress).where(eq(platformUserProgress.sub, sub));
    assert.equal(progress.xp, 50);

    // Another app has its own cap.
    await ingestEvents(parseEventBody(envelope("hollowmere", sub, "stat.increment", { key: "hollowmere.days.played", by: 1 }), "hollowmere"), day1);
    [progress] = await platformDb.select().from(platformUserProgress).where(eq(platformUserProgress.sub, sub));
    assert.equal(progress.xp, 60);

    // Next Berlin day: 22:30 UTC in summer = 00:30 in Berlin.
    const day2 = new Date("2026-06-01T22:30:00Z");
    const more = Array.from({ length: 80 }, () => envelope("saga", sub, "stat.increment", { key: "saga.turns", by: 1 }));
    await ingestEvents(parseEventBody({ events: more }, "saga"), day2);
    [progress] = await platformDb.select().from(platformUserProgress).where(eq(platformUserProgress.sub, sub));
    // 50 capped XP + storyteller badge (100 turns → +75 uncapped) on day 2.
    assert.equal((await getStats(platformDb, sub))["saga.turns"], 110);
    assert.equal(progress.xp, 60 + 50 + 75);
    assert.equal(progress.level, levelForXp(progress.xp));
  } finally {
    delete process.env.TRETU_XP_DAILY_CAP_PER_APP;
  }
});

test("level.up is emitted once per new level; Allrounder after 3 apps", async () => {
  const sub = uuid();
  await seedUser(sub, "erin");
  await send("saga", envelope("saga", sub, "stat.increment", { key: "saga.worlds.created", by: 1 }));
  await send("hollowmere", envelope("hollowmere", sub, "stat.increment", { key: "hollowmere.creatures.befriended", by: 1 }));
  await send("mc-dashboard", envelope("mc-dashboard", sub, "stat.increment", { key: "minecraft.playtime.minutes", by: 61 }));
  const stats = await getStats(platformDb, sub);
  assert.equal(stats["tretu.apps.used"], 3);
  const keys = (await badgeRows(sub)).map((b) => b.badgeKey).sort();
  assert.deepEqual(keys, ["allrounder", "hollowmere.befriender-1", "minecraft.playtime-1h", "saga.worldbuilder"]);
  const [progress] = await platformDb.select().from(platformUserProgress).where(eq(platformUserProgress.sub, sub));
  const levelUps = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.type, "level.up"));
  const levels = [...new Set(levelUps.map((r) => (r.payload.data as { level: number }).level))];
  assert.ok(progress.level >= 2);
  assert.equal(levels[levels.length - 1], progress.level);
  assert.equal(levelUps.length, levels.length * 2);
});

test("user.created/updated from auth fill the directory; out-of-order updates are ignored", async () => {
  const sub = uuid();
  const t0 = new Date("2026-11-01T10:00:00Z");
  const created = envelope("auth", sub, "user.created", {
    sub,
    username: "Frank",
    name: "Frank F.",
    picture: "https://auth.tretu.de/avatars/frank.png",
    locale: "en",
    roles: [],
    links: { discord: "123456789" },
    createdAt: "2026-11-01T09:59:00Z",
  }, t0);
  let res = await send("auth", created);
  assert.equal(res.status, 202);
  const updated = envelope("auth", sub, "user.updated", { sub, username: "frank2", name: "Frank", locale: "de", roles: ["admin"], links: {} }, new Date(t0.getTime() + 60_000));
  const stale = envelope("auth", sub, "user.updated", { sub, username: "old", name: "Old" }, new Date(t0.getTime() + 30_000));
  res = await send("auth", { events: [updated, stale] });
  assert.equal(res.body.accepted, 2);

  const profile = await getUser(await signedRequest("play", "GET", `/api/v1/users/${sub}`), ctx({ sub }));
  assert.equal(profile.status, 200);
  const body = (await profile.json()) as Record<string, unknown>;
  assert.equal(body.username, "frank2");
  assert.equal(body.name, "Frank");
  assert.equal(body.level, levelForXp(body.xp as number));
  assert.equal(body.profileUrl, "https://tretu.de/u/frank2");
  assert.ok((body.badges as { key: string }[]).some((b) => b.key === "early-supporter"));
  assert.equal(typeof body.xpNextLevel, "number");

  const forwarded = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.type, "user.updated"));
  assert.equal(forwarded.length, 2); // saga + play, not auth itself

  const missing = await getUser(await signedRequest("play", "GET", `/api/v1/users/${uuid()}`), ctx({ sub: uuid() }));
  assert.equal(missing.status, 404);
});
