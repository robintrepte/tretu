/**
 * Development data for the platform pages (never run in production):
 *   TRETU_PLATFORM_DEV_SUB=<uuid> DATABASE_URL=postgres://postgres@localhost:5432/tretu_platform npm run platform:seed-dev
 * Creates the dev user, a few friends with presence, game stats, badges, notifications and wallet bookings.
 */
import { randomUUID } from "node:crypto";

import { closePlatformDb, platformDb } from "@/lib/platform/db";
import { upsertDirectoryUser } from "@/lib/platform/directory";
import { ingestEvents, parseEventBody } from "@/lib/platform/events";
import { acceptFriendRequest, sendFriendRequest } from "@/lib/platform/friends";
import { createNotification } from "@/lib/platform/notifications";
import { setPresence } from "@/lib/platform/presence";
import { bookTransaction, getBalance } from "@/lib/platform/wallet";

if (process.env.NODE_ENV === "production") {
  console.error("refusing to seed in production");
  process.exit(1);
}

const devSub = process.env.TRETU_PLATFORM_DEV_SUB?.trim() || "00000000-0000-4000-8000-000000000001";
const users = [
  { sub: devSub, username: "robin", name: process.env.TRETU_PLATFORM_DEV_NAME || "Robin" },
  { sub: "00000000-0000-4000-8000-000000000002", username: "mia", name: "Mia" },
  { sub: "00000000-0000-4000-8000-000000000003", username: "jonas", name: "Jonas" },
  { sub: "00000000-0000-4000-8000-000000000004", username: "lea", name: "Lea" },
  { sub: "00000000-0000-4000-8000-000000000005", username: "ben", name: "Ben" },
];

function ev(app: string, sub: string, type: string, data: Record<string, unknown>) {
  return { id: randomUUID(), type, app, sub, occurredAt: new Date().toISOString(), data };
}

async function main() {
  for (const u of users) {
    await upsertDirectoryUser(
      platformDb,
      { ...u, locale: "de", roles: [], links: {}, createdAt: "2026-10-15T12:00:00Z" } as never,
      new Date(0)
    );
  }
  const [me, mia, jonas, lea, ben] = users.map((u) => u.sub);

  const events = [
    ...Array.from({ length: 14 }, (_, i) => ev("play", me, "game.finished", { game: i % 3 ? "chess" : "maumau", result: i % 2 ? "loss" : "win" })),
    ev("saga", me, "stat.increment", { key: "saga.turns", by: 140 }),
    ev("saga", me, "stat.increment", { key: "saga.worlds.created", by: 2 }),
    ev("saga", me, "stat.increment", { key: "saga.characters.created", by: 3 }),
    ev("saga", me, "game.finished", { game: "campaign", result: "completed" }),
    ev("hollowmere", me, "stat.increment", { key: "hollowmere.creatures.befriended", by: 12 }),
    ev("hollowmere", me, "stat.increment", { key: "hollowmere.days.played", by: 5 }),
    ev("mc-dashboard", me, "stat.increment", { key: "minecraft.playtime.minutes", by: 725 }),
  ];
  for (const app of ["play", "saga", "hollowmere", "mc-dashboard"]) {
    const mine = events.filter((e) => e.app === app);
    if (mine.length) await ingestEvents(parseEventBody({ events: mine }, app));
  }
  await ingestEvents(parseEventBody({ events: [ev("play", mia, "game.finished", { game: "chess", result: "win" })] }, "play"));

  for (const friend of [mia, jonas, lea]) {
    try {
      const req = await sendFriendRequest(platformDb, friend, me);
      if (req.status === "pending") await acceptFriendRequest(platformDb, req.id, me);
    } catch {
      // already friends
    }
  }
  try {
    await sendFriendRequest(platformDb, ben, me);
  } catch {
    // already pending
  }

  await setPresence(platformDb, mia, "play", { status: "playing", activity: "Schach", joinUrl: "https://play.tretu.de/r/demo" });
  await setPresence(platformDb, jonas, "saga", { status: "online" });

  await getBalance(platformDb, me);
  await bookTransaction(platformDb, { sub: me, app: "saga", idempotencyKey: "seed-spend-1", kind: "spend", amount: -30, reason: "Bild (HQ)" });
  await bookTransaction(platformDb, { sub: me, app: "saga", idempotencyKey: "seed-spend-2", kind: "spend", amount: -12, reason: "Spielrunden" });

  await createNotification(platformDb, {
    sub: me,
    app: "play",
    type: "invite",
    title: "Mia lädt dich zu einer Partie Schach ein",
    body: "Einladung von Mia",
    url: "https://play.tretu.de/r/demo",
    icon: "Send",
    actorSub: mia,
  });
  console.log(`seeded platform dev data for ${devSub}`);
  await closePlatformDb();
}

void main();
