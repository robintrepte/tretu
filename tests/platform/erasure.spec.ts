import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { eq, sql } from "drizzle-orm";

import { closeDatabase, ctx, envelope, resetDatabase, seedUser, signedRequest, uuid } from "./helpers";
import { POST as postEvents } from "../../src/app/api/v1/events/route";
import { GET as getWallet } from "../../src/app/api/v1/wallet/[sub]/route";
import * as schema from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { acceptFriendRequest, sendFriendRequest } from "../../src/lib/platform/friends";
import { createNotification } from "../../src/lib/platform/notifications";
import { setPresence } from "../../src/lib/platform/presence";
import { getStats } from "../../src/lib/platform/progress";
import { savePushSubscription } from "../../src/lib/platform/push";
import { bookTransaction } from "../../src/lib/platform/wallet";

beforeEach(resetDatabase);
after(closeDatabase);

async function send(app: string, body: unknown) {
  const res = await postEvents(await signedRequest(app, "POST", "/api/v1/events", body), ctx());
  return res.status;
}

test("user.deleted erases all platform data for the sub, keeps the ledger balanced and forwards the event", async () => {
  const gone = uuid();
  const friend = uuid();
  await send("auth", envelope("auth", gone, "user.created", { username: "leaver", name: "Leaver", links: { discord: "42" } }));
  await seedUser(friend, "stayer");
  await send("play", { events: Array.from({ length: 3 }, () => envelope("play", gone, "game.finished", { game: "chess", result: "win" })) });
  await bookTransaction(platformDb, { sub: gone, app: "saga", idempotencyKey: "s1", kind: "spend", amount: -10, reason: "Runde von leaver" });
  const req = await sendFriendRequest(platformDb, gone, friend);
  await acceptFriendRequest(platformDb, req.id, friend);
  await createNotification(platformDb, { sub: friend, app: "play", type: "invite", title: "leaver lädt dich ein", actorSub: gone });
  await setPresence(platformDb, gone, "play", { status: "online" });
  await savePushSubscription(platformDb, gone, { endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } }, "UA");
  assert.equal((await getStats(platformDb, friend))["tretu.friends"], 1);

  assert.equal(await send("auth", envelope("auth", gone, "user.deleted", {})), 202);

  const bySub = async (table: typeof schema.platformUsers | typeof schema.platformUserStats) =>
    platformDb.select().from(table).where(eq(table.sub, gone));
  assert.equal((await bySub(schema.platformUsers)).length, 0);
  assert.equal((await bySub(schema.platformUserStats)).length, 0);
  for (const table of [
    schema.platformUserProgress,
    schema.platformUserBadges,
    schema.platformUserApps,
    schema.platformDailyCounters,
    schema.platformPresence,
    schema.platformNotifications,
    schema.platformPushSubscriptions,
    schema.platformWalletDaily,
    schema.platformJobs,
  ]) {
    const rows = await platformDb.select().from(table).where(eq(table.sub, gone));
    assert.equal(rows.length, 0, `${String((table as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")])} erased`);
  }
  assert.equal((await platformDb.select().from(schema.platformWalletAccounts).where(eq(schema.platformWalletAccounts.sub, gone))).length, 0);
  assert.equal((await platformDb.select().from(schema.platformWalletTransactions).where(eq(schema.platformWalletTransactions.sub, gone))).length, 0);
  assert.equal((await platformDb.select().from(schema.platformEvents).where(eq(schema.platformEvents.sub, gone))).length, 0);
  assert.equal((await platformDb.select().from(schema.platformFriendships)).length, 0);
  assert.equal((await platformDb.select().from(schema.platformNotifications).where(eq(schema.platformNotifications.actorSub, gone))).length, 0);
  // No text in the whole database still mentions the sub or the username (except the tombstone).
  const dump = await platformDb.execute(sql`
    select string_agg(t::text, ' ') as s from (
      select row_to_json(x)::text as t from platform_wallet_transactions x union all
      select row_to_json(x)::text from platform_wallet_accounts x union all
      select row_to_json(x)::text from platform_events x union all
      select row_to_json(x)::text from platform_notifications x
    ) q`);
  const text = String((dump[0] as { s: string | null }).s ?? "");
  assert.ok(!text.includes(gone), "sub not left behind");
  assert.ok(!text.includes("leaver"), "name not left behind");

  assert.equal((await getStats(platformDb, friend))["tretu.friends"], 0);
  const [total] = await platformDb.select({ sum: sql<string>`sum(${schema.platformWalletAccounts.balance})` }).from(schema.platformWalletAccounts);
  assert.equal(Number(total.sum), 0);

  const forwarded = await platformDb.select().from(schema.platformOutbox).where(eq(schema.platformOutbox.type, "user.deleted"));
  assert.deepEqual(forwarded.map((r) => r.targetApp).sort(), ["play", "saga"]);
  assert.deepEqual(forwarded[0].payload.data, {});
  // Only the user.deleted webhooks remain queued for that sub.
  const queued = await platformDb.select().from(schema.platformOutbox).where(eq(schema.platformOutbox.sub, gone));
  assert.ok(queued.every((r) => r.type === "user.deleted"));

  // Late events and wallet calls do not resurrect the user.
  assert.equal(await send("play", envelope("play", gone, "game.finished", { game: "chess", result: "win" })), 202);
  assert.equal((await platformDb.select().from(schema.platformUserStats).where(eq(schema.platformUserStats.sub, gone))).length, 0);
  const wallet = await getWallet(await signedRequest("saga", "GET", `/api/v1/wallet/${gone}`), ctx({ sub: gone }));
  assert.equal(wallet.status, 404);
  assert.equal(await send("auth", envelope("auth", gone, "user.updated", { username: "back" })), 202);
  assert.equal((await platformDb.select().from(schema.platformUsers).where(eq(schema.platformUsers.sub, gone))).length, 0);
});
