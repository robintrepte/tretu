/**
 * Taking back Discord roles / TeamSpeak server groups granted for badges: on user.deleted (also
 * merges), identity changes and badge-mapping changes. Discord and TeamSpeak are mocked.
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";

import { and, eq, isNull } from "drizzle-orm";

import { closeDatabase, ctx, envelope, resetDatabase, signedRequest, uuid } from "./helpers";
import { POST as postEvents } from "../../src/app/api/v1/events/route";
import { platformBadgeSync, platformJobs, platformTsLinks } from "../../src/db/platform-schema";
import { createTeamspeakSyncHandler, discordRevokeJob, discordSyncJob, reconcileBadgeSync } from "../../src/lib/platform/badge-sync";
import { platformDb } from "../../src/lib/platform/db";
import { runDueJobs, type JobRow } from "../../src/lib/platform/jobs";
import { startTsLink, verifyTsLink } from "../../src/lib/platform/teamspeak";
import { runDeliveryTick } from "../../src/lib/platform/worker";
import type { TeamSpeakQueryClient } from "../../src/lib/teamspeak/query-client";

const ENV_KEYS = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "TRETU_BADGE_DISCORD_ROLES_JSON",
  "TRETU_BADGE_TS_GROUPS_JSON",
  "TS_QUERY_HOST",
  "TS_QUERY_USER",
  "TS_QUERY_PASSWORD",
];
const GUILD = "262342293250506752";
const realFetch = globalThis.fetch;

beforeEach(async () => {
  await resetDatabase();
  process.env.DISCORD_BOT_TOKEN = "bot-token";
  process.env.DISCORD_GUILD_ID = GUILD;
  process.env.TRETU_BADGE_DISCORD_ROLES_JSON = JSON.stringify({ "play.first-win": "111", "wins-10": "222" });
  process.env.TS_QUERY_HOST = "127.0.0.1";
  process.env.TS_QUERY_USER = "serveradmin";
  process.env.TS_QUERY_PASSWORD = "pw";
  process.env.TRETU_BADGE_TS_GROUPS_JSON = JSON.stringify({ "play.first-win": 31 });
});
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  globalThis.fetch = realFetch;
});
after(closeDatabase);

async function send(app: string, body: unknown) {
  const res = await postEvents(await signedRequest(app, "POST", "/api/v1/events", body), ctx());
  assert.equal(res.status, 202);
}

async function createUser(username: string, discord?: string, occurredAt = new Date(Date.now() - 60_000)) {
  const sub = uuid();
  await send("auth", envelope("auth", sub, "user.created", { username, name: username, links: discord ? { discord } : {} }, occurredAt));
  return sub;
}

async function win(sub: string) {
  await send("play", envelope("play", sub, "game.finished", { game: "chess", result: "win" }));
}

/** Discord API mock: records calls, answers with `status(call)` (default 204). */
function discordMock(status: (call: { method: string; url: string }) => number = () => 204) {
  const calls: { method: string; url: string }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const call = { method: String(init.method), url };
    calls.push(call);
    return new Response(null, { status: status(call) });
  };
  return { calls, fetchImpl };
}

/** TeamSpeak ServerQuery mock. */
function tsMock(options: { failDelete?: (n: number) => Error | null } = {}) {
  const added: [number, number][] = [];
  const removed: [number, number][] = [];
  const client = {
    connect: async () => undefined,
    disconnect: async () => undefined,
    serverGroupAddClient: async (group: number, dbId: number) => {
      added.push([group, dbId]);
    },
    serverGroupDelClient: async (group: number, dbId: number) => {
      const error = options.failDelete?.(removed.length);
      removed.push([group, dbId]);
      if (error) throw error;
    },
  } as unknown as TeamSpeakQueryClient;
  return { added, removed, client };
}

async function linkTs(sub: string, dbId: number, uid = `uid-${dbId}=`) {
  const { code } = await startTsLink(platformDb, sub);
  await verifyTsLink(platformDb, sub, new Date(), async () => [
    { clid: "1", clientDatabaseId: dbId, uniqueIdentifier: uid, nickname: `Player ${code}`, channelId: 1, clientIdleTimeMs: 0 },
  ]);
}

/** Runs every due badge job (sync + revoke) with the mocks; returns the summed counts. */
async function runBadgeJobs(discord: ReturnType<typeof discordMock>, ts: ReturnType<typeof tsMock>, now = new Date()) {
  const d = await runDueJobs(
    {
      "badge.sync.discord": (job: JobRow) => discordSyncJob(platformDb, job, discord.fetchImpl),
      "badge.revoke.discord": (job: JobRow) => discordRevokeJob(platformDb, job, discord.fetchImpl),
    },
    { now }
  );
  const handler = createTeamspeakSyncHandler(platformDb, () => ts.client);
  const t = await runDueJobs({ "badge.sync.teamspeak": handler.handle, "badge.revoke.teamspeak": handler.revoke }, { now });
  await handler.close();
  return { done: d.done + t.done, retried: d.retried + t.retried, failed: d.failed + t.failed };
}

async function pendingJobs(type?: string) {
  const rows = await platformDb.select().from(platformJobs).where(eq(platformJobs.status, "pending"));
  return type ? rows.filter((r) => r.type === type) : rows;
}

async function syncRows(sub: string) {
  return platformDb.select().from(platformBadgeSync).where(eq(platformBadgeSync.sub, sub));
}

const roleUrl = (discordId: string, role: string) => `https://discord.com/api/v10/guilds/${GUILD}/members/${discordId}/roles/${role}`;

test("grants record exactly what was granted (identity + role / group)", async () => {
  const sub = await createUser("granted", "4242");
  await linkTs(sub, 77);
  await win(sub);
  const discord = discordMock();
  const ts = tsMock();
  assert.deepEqual(await runBadgeJobs(discord, ts), { done: 2, retried: 0, failed: 0 });
  assert.deepEqual(discord.calls, [{ method: "PUT", url: roleUrl("4242", "111") }]);
  assert.deepEqual(ts.added, [[31, 77]]);
  const rows = (await syncRows(sub)).map((r) => [r.target, r.status, r.grantedTo, r.grantedRef]).sort();
  assert.deepEqual(rows, [
    ["discord", "done", "4242", "111"],
    ["teamspeak", "done", "77", "31"],
  ]);
});

test("user.deleted removes every granted Discord role and TeamSpeak group (durable, retried, idempotent)", async () => {
  const sub = await createUser("leaver", "4242");
  await linkTs(sub, 77);
  await win(sub);
  const discord = discordMock(({ method }) => (method === "DELETE" && discord.calls.filter((c) => c.method === "DELETE").length === 1 ? 500 : 204));
  const ts = tsMock({ failDelete: (n) => (n === 0 ? new Error("TS query servergroupdelclient failed: flooding (id=524)") : null) });
  await runBadgeJobs(discord, ts);

  const deletion = envelope("auth", sub, "user.deleted", {});
  await send("auth", deletion);
  await send("auth", deletion); // duplicate delivery: no second set of jobs

  // The sync state is erased with the user, the removals are queued without a sub.
  assert.equal((await syncRows(sub)).length, 0);
  assert.equal((await platformDb.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub))).length, 0);
  const revokes = await pendingJobs();
  assert.deepEqual(revokes.map((j) => j.type).sort(), ["badge.revoke.discord", "badge.revoke.teamspeak"]);
  assert.ok(revokes.every((j) => j.sub === null));
  assert.deepEqual(
    revokes.map((j) => [j.payload.to, j.payload.ref, j.payload.reason]).sort(),
    [
      ["4242", "111", "user.deleted"],
      ["77", "31", "user.deleted"],
    ]
  );

  // First attempt fails on both sides (Discord 500, TS flood) and is retried with backoff.
  assert.deepEqual(await runBadgeJobs(discord, ts), { done: 0, retried: 2, failed: 0 });
  const [later] = await pendingJobs();
  const retryAt = new Date(later.nextAttemptAt.getTime() + 1000);
  assert.deepEqual(await runBadgeJobs(discord, ts, retryAt), { done: 2, retried: 0, failed: 0 });
  assert.deepEqual(
    discord.calls.filter((c) => c.method === "DELETE"),
    [
      { method: "DELETE", url: roleUrl("4242", "111") },
      { method: "DELETE", url: roleUrl("4242", "111") },
    ]
  );
  assert.deepEqual(ts.removed, [
    [31, 77],
    [31, 77],
  ]);
  // Finished jobs keep no identity of the deleted user.
  const finished = await platformDb.select().from(platformJobs).where(eq(platformJobs.status, "done"));
  for (const job of finished.filter((j) => j.type.startsWith("badge.revoke."))) {
    assert.equal(job.payload.to, undefined);
    assert.equal(job.sub, null);
  }
  assert.equal((await pendingJobs()).length, 0);
});

test("removing is a no-op for members who already left (Discord 404, TeamSpeak 'not in group')", async () => {
  const sub = await createUser("gone", "4242");
  await linkTs(sub, 77);
  await win(sub);
  const discord = discordMock(({ method }) => (method === "DELETE" ? 404 : 204));
  const ts = tsMock({ failDelete: () => new Error("TS query servergroupdelclient failed: empty result set (id=2563)") });
  await runBadgeJobs(discord, ts);
  await send("auth", envelope("auth", sub, "user.deleted", {}));
  assert.deepEqual(await runBadgeJobs(discord, ts), { done: 2, retried: 0, failed: 0 });
});

test("a grant finishing while the user is erased is taken back instead of recorded", async () => {
  const sub = await createUser("racer", "4242");
  await win(sub);
  let erased = false;
  const discord = discordMock();
  const racing = async (url: string, init: RequestInit) => {
    if (init.method === "PUT" && !erased) {
      erased = true;
      await send("auth", envelope("auth", sub, "user.deleted", {}));
    }
    return discord.fetchImpl(url, init);
  };
  await runDueJobs({ "badge.sync.discord": (job: JobRow) => discordSyncJob(platformDb, job, racing) });
  assert.equal((await syncRows(sub)).length, 0, "no sync state for an erased sub");
  const [revoke] = await pendingJobs("badge.revoke.discord");
  assert.deepEqual([revoke.payload.to, revoke.payload.ref], ["4242", "111"]);
  await runBadgeJobs(discord, tsMock());
  assert.deepEqual(discord.calls.at(-1), { method: "DELETE", url: roleUrl("4242", "111") });
});

test("merge: grants move to the surviving account when it has the same Discord / TeamSpeak identity", async () => {
  const legacy = await createUser("oldplay", "4242");
  await linkTs(legacy, 77);
  await win(legacy);
  const discord = discordMock();
  const ts = tsMock();
  await runBadgeJobs(discord, ts);

  // The surviving account has the same Discord account linked, and no TeamSpeak link yet.
  const survivor = await createUser("main", "4242");
  assert.equal((await pendingJobs()).length, 0);

  await send("auth", envelope("auth", legacy, "user.deleted", { mergedInto: survivor }));

  assert.equal((await pendingJobs("badge.revoke.discord")).length, 0, "same Discord account: role stays");
  assert.equal((await pendingJobs("badge.revoke.teamspeak")).length, 0, "TS link moved: group stays");
  const [link] = await platformDb.select().from(platformTsLinks).where(eq(platformTsLinks.sub, survivor));
  assert.equal(link.tsClientDbId, 77);
  const moved = (await syncRows(survivor)).filter((r) => r.badgeKey === "play.first-win" && r.status === "done");
  assert.deepEqual(moved.map((r) => [r.target, r.grantedTo, r.grantedRef]).sort(), [
    ["discord", "4242", "111"],
    ["teamspeak", "77", "31"],
  ]);
  // The surviving account earned the badge through the moved stats; nothing is granted twice.
  const before = discord.calls.length;
  await runBadgeJobs(discord, ts);
  assert.equal(discord.calls.length, before);
  assert.deepEqual(ts.added, [[31, 77]]);
});

test("merge: grants are removed when the surviving account has another identity", async () => {
  const legacy = await createUser("legacy", "4242");
  await linkTs(legacy, 77);
  await win(legacy);
  const survivor = await createUser("other", "5353");
  await linkTs(survivor, 88);
  await win(survivor);
  const discord = discordMock();
  const ts = tsMock();
  await runBadgeJobs(discord, ts);

  await send("auth", envelope("auth", legacy, "user.deleted", { mergedInto: survivor }));
  const revokes = await pendingJobs();
  assert.deepEqual(revokes.map((j) => [j.type, j.payload.to, j.payload.ref, j.payload.reason]).sort(), [
    ["badge.revoke.discord", "4242", "111", "user.merged"],
    ["badge.revoke.teamspeak", "77", "31", "user.merged"],
  ]);
  await runBadgeJobs(discord, ts);
  assert.deepEqual(discord.calls.filter((c) => c.method === "DELETE"), [{ method: "DELETE", url: roleUrl("4242", "111") }]);
  assert.deepEqual(ts.removed, [[31, 77]]);
  // The survivor keeps its own grants.
  const own = (await syncRows(survivor)).map((r) => [r.target, r.grantedTo]).sort();
  assert.deepEqual(own, [
    ["discord", "5353"],
    ["teamspeak", "88"],
  ]);
});

test("reconciliation removes roles / groups that no longer map and grants the new mapping", async () => {
  const sub = await createUser("mapper", "4242");
  await linkTs(sub, 77);
  await win(sub);
  const discord = discordMock();
  const ts = tsMock();
  await runBadgeJobs(discord, ts);
  assert.equal(await reconcileBadgeSync(platformDb), 0, "nothing to do while the mapping is unchanged");
  assert.equal((await pendingJobs()).length, 0);

  // The badge now maps to another role and the TS mapping was dropped.
  process.env.TRETU_BADGE_DISCORD_ROLES_JSON = JSON.stringify({ "play.first-win": "333" });
  process.env.TRETU_BADGE_TS_GROUPS_JSON = JSON.stringify({});
  assert.equal(await reconcileBadgeSync(platformDb), 1, "re-grant of the new role");
  assert.deepEqual((await pendingJobs()).map((j) => [j.type, j.payload.to ?? j.payload.sub, j.payload.ref ?? j.payload.badge, j.payload.reason]).sort(), [
    ["badge.revoke.discord", "4242", "111", "mapping.changed"],
    ["badge.revoke.teamspeak", "77", "31", "mapping.changed"],
    ["badge.sync.discord", sub, "play.first-win", undefined],
  ]);
  await runBadgeJobs(discord, ts);
  assert.deepEqual(discord.calls.slice(1), [
    { method: "DELETE", url: roleUrl("4242", "111") },
    { method: "PUT", url: roleUrl("4242", "333") },
  ]);
  assert.deepEqual(ts.removed, [[31, 77]]);
  assert.equal(await reconcileBadgeSync(platformDb), 0, "idempotent");

  // An invalid mapping never removes anything; an empty one removes everything that was granted.
  process.env.TRETU_BADGE_DISCORD_ROLES_JSON = "{not json";
  assert.equal(await reconcileBadgeSync(platformDb), 0);
  assert.equal((await pendingJobs()).length, 0);
  delete process.env.TRETU_BADGE_DISCORD_ROLES_JSON;
  await reconcileBadgeSync(platformDb);
  assert.deepEqual((await pendingJobs()).map((j) => [j.type, j.payload.ref]), [["badge.revoke.discord", "333"]]);
  // Without bot credentials nothing can be removed: grants stay recorded until they are back.
  await platformDb.delete(platformJobs);
  delete process.env.DISCORD_BOT_TOKEN;
  await platformDb.insert(platformBadgeSync).values({ sub, badgeKey: "wins-10", target: "discord", status: "done", grantedTo: "4242", grantedRef: "222" });
  assert.equal(await reconcileBadgeSync(platformDb), 0);
  assert.equal((await pendingJobs()).length, 0);
});

test("a role still needed by another badge (same role) is not removed", async () => {
  process.env.TRETU_BADGE_DISCORD_ROLES_JSON = JSON.stringify({ "play.first-win": "111", "allrounder": "111" });
  const sub = await createUser("shared", "4242");
  await platformDb.insert(platformBadgeSync).values([
    { sub, badgeKey: "play.first-win", target: "discord", status: "done", grantedTo: "4242", grantedRef: "111" },
    { sub, badgeKey: "allrounder", target: "discord", status: "done", grantedTo: "4242", grantedRef: "111" },
  ]);
  process.env.TRETU_BADGE_DISCORD_ROLES_JSON = JSON.stringify({ allrounder: "111" });
  await reconcileBadgeSync(platformDb);
  const discord = discordMock();
  await runBadgeJobs(discord, tsMock());
  assert.deepEqual(discord.calls, [], "allrounder still holds role 111");
  assert.deepEqual((await syncRows(sub)).map((r) => r.badgeKey), ["allrounder"]);
});

test("changing or unlinking the Discord / TeamSpeak identity moves the grants", async () => {
  const sub = await createUser("mover", "4242");
  await linkTs(sub, 77);
  await win(sub);
  const discord = discordMock();
  const ts = tsMock();
  await runBadgeJobs(discord, ts);

  await send("auth", envelope("auth", sub, "user.updated", { username: "mover", name: "mover", links: { discord: "9999" } }));
  await runBadgeJobs(discord, ts);
  assert.deepEqual(discord.calls.slice(1), [
    { method: "DELETE", url: roleUrl("4242", "111") },
    { method: "PUT", url: roleUrl("9999", "111") },
  ]);

  // Re-linking TeamSpeak to another identity, then unlinking it.
  await linkTs(sub, 88);
  const { releaseStaleGrants, enqueueBadgeResync } = await import("../../src/lib/platform/badge-sync");
  await releaseStaleGrants(platformDb, { sub, target: "teamspeak" });
  await enqueueBadgeResync(platformDb, sub, "teamspeak");
  await runBadgeJobs(discord, ts);
  assert.deepEqual(ts.removed, [[31, 77]]);
  assert.deepEqual(ts.added, [
    [31, 77],
    [31, 88],
  ]);
  const { unlinkTs } = await import("../../src/lib/platform/teamspeak");
  const previous = await unlinkTs(platformDb, sub);
  assert.equal(previous, "88");
  await releaseStaleGrants(platformDb, { sub, target: "teamspeak", previousIdentity: previous });
  await runBadgeJobs(discord, ts);
  assert.deepEqual(ts.removed, [
    [31, 77],
    [31, 88],
  ]);
  const left = await platformDb
    .select()
    .from(platformBadgeSync)
    .where(and(eq(platformBadgeSync.sub, sub), eq(platformBadgeSync.target, "teamspeak")));
  assert.equal(left.length, 0);
});

test("grants recorded before the granted_* columns are removed with the identity and mapping in effect", async () => {
  const sub = await createUser("oldrow", "4242");
  await platformDb.insert(platformBadgeSync).values({ sub, badgeKey: "play.first-win", target: "discord", status: "done" });
  await send("auth", envelope("auth", sub, "user.deleted", {}));
  const [revoke] = await pendingJobs("badge.revoke.discord");
  assert.deepEqual([revoke.payload.to, revoke.payload.ref], ["4242", "111"]);
  assert.equal((await platformDb.select().from(platformBadgeSync).where(isNull(platformBadgeSync.grantedTo))).length, 0);
});

test("the worker tick delivers Discord removals (global fetch mocked)", async () => {
  const sub = await createUser("ticker", "4242");
  await platformDb.insert(platformBadgeSync).values({ sub, badgeKey: "play.first-win", target: "discord", status: "done", grantedTo: "4242", grantedRef: "111" });
  delete process.env.TS_QUERY_HOST;
  await send("auth", envelope("auth", sub, "user.deleted", {}));
  const discord = discordMock();
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.startsWith("https://discord.com/")) return discord.fetchImpl(href, init ?? {});
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await runDeliveryTick();
  assert.deepEqual(discord.calls, [{ method: "DELETE", url: roleUrl("4242", "111") }]);
  assert.equal((await pendingJobs("badge.revoke.discord")).length, 0);
});
