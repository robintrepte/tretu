import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { closeDatabase, envelope, resetDatabase, seedUser, uuid } from "./helpers";
import { platformBadgeSync, platformJobs, platformPushSubscriptions } from "../../src/db/platform-schema";
import { createTeamspeakSyncHandler, discordSyncJob, reconcileBadgeSync } from "../../src/lib/platform/badge-sync";
import { platformDb } from "../../src/lib/platform/db";
import { ingestEvents, parseEventBody } from "../../src/lib/platform/events";
import { formatMessage, createTranslator } from "../../src/lib/platform/i18n-core";
import { runDueJobs, type JobRow } from "../../src/lib/platform/jobs";
import { createNotification } from "../../src/lib/platform/notifications";
import { savePushSubscription, sendPushJob } from "../../src/lib/platform/push";
import { getTsLinkState, startTsLink, verifyTsLink } from "../../src/lib/platform/teamspeak";
import type { TeamSpeakQueryClient } from "../../src/lib/teamspeak/query-client";

const ENV_KEYS = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "TRETU_BADGE_DISCORD_ROLES_JSON",
  "TRETU_BADGE_TS_GROUPS_JSON",
  "TS_QUERY_HOST",
  "TS_QUERY_USER",
  "TS_QUERY_PASSWORD",
  "WEB_PUSH_PUBLIC_KEY",
  "WEB_PUSH_PRIVATE_KEY",
  "WEB_PUSH_SUBJECT",
];

beforeEach(resetDatabase);
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});
after(closeDatabase);

async function win(sub: string) {
  await ingestEvents(parseEventBody(envelope("play", sub, "game.finished", { game: "chess", result: "win" }), "play"));
}

async function jobs(type: string) {
  return platformDb.select().from(platformJobs).where(eq(platformJobs.type, type));
}

test("i18n formatter: interpolation, plural, select, number", () => {
  assert.equal(formatMessage("Hallo {name}", { name: "Robin" }), "Hallo Robin");
  const plural = "{count, plural, =0 {Keine Freunde} one {# Freund} other {# Freunde}}";
  assert.equal(formatMessage(plural, { count: 0 }), "Keine Freunde");
  assert.equal(formatMessage(plural, { count: 1 }), "1 Freund");
  assert.equal(formatMessage(plural, { count: 1200 }), "1.200 Freunde");
  assert.equal(formatMessage("{v, select, public {öffentlich} other {privat}}", { v: "x" }), "privat");
  assert.equal(formatMessage("{n, number} TC", { n: 12345 }, "en"), "12,345 TC");
  const t = createTranslator("en");
  assert.equal(t("friends.count", { count: 2 }), "2 friends");
  assert.equal(createTranslator("de")("nav.friends"), "Freunde");
});

test("Discord badge sync: off without env; role PUT once; skipped without link", async () => {
  const sub = uuid();
  await seedUser(sub, "disco", { links: { discord: "999" } });
  await win(sub);
  assert.equal((await jobs("badge.sync.discord")).length, 0, "off without env");

  process.env.DISCORD_BOT_TOKEN = "bot-token";
  process.env.DISCORD_GUILD_ID = "262342293250506752";
  process.env.TRETU_BADGE_DISCORD_ROLES_JSON = JSON.stringify({ "play.first-win": "111", "wins-10": "222" });
  // Existing badge gets picked up by the reconciliation.
  assert.equal(await reconcileBadgeSync(platformDb), 1);
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: calls.length === 1 ? 429 : 204 });
  };
  const handlers = { "badge.sync.discord": (job: JobRow) => discordSyncJob(platformDb, job, fetchImpl) };
  assert.deepEqual(await runDueJobs(handlers), { done: 0, retried: 1, failed: 0 });
  const [job] = await jobs("badge.sync.discord");
  assert.deepEqual(await runDueJobs(handlers, { now: new Date(job.nextAttemptAt.getTime() + 1) }), { done: 1, retried: 0, failed: 0 });
  assert.equal(calls[1].url, "https://discord.com/api/v10/guilds/262342293250506752/members/999/roles/111");
  assert.equal(calls[1].init.method, "PUT");
  assert.equal((calls[1].init.headers as Record<string, string>).authorization, "Bot bot-token");
  const [state] = await platformDb.select().from(platformBadgeSync).where(eq(platformBadgeSync.sub, sub));
  assert.equal(state.status, "done");
  assert.equal(await reconcileBadgeSync(platformDb), 0, "idempotent");

  // A user without Discord link is skipped (no HTTP call).
  const other = uuid();
  await seedUser(other, "nolink");
  await win(other);
  await runDueJobs(handlers);
  assert.equal(calls.length, 2);
  const [skipped] = await platformDb
    .select()
    .from(platformBadgeSync)
    .where(and(eq(platformBadgeSync.sub, other), eq(platformBadgeSync.target, "discord")));
  assert.equal(skipped.status, "skipped");
});

test("TeamSpeak: link identity via nickname code, then add the mapped server group", async () => {
  const sub = uuid();
  await seedUser(sub, "speaker");
  const { code } = await startTsLink(platformDb, sub);
  assert.match(code, /^TRT-[A-Z2-9]{5}$/);
  const online = [{ clid: "5", clientDatabaseId: 77, uniqueIdentifier: "abc\\/def=", nickname: `Speaker ${code}`, channelId: 1, clientIdleTimeMs: 0 }];
  await assert.rejects(() => verifyTsLink(platformDb, sub, new Date(), async () => []), { code: "ts_client_not_found" });
  assert.deepEqual(await verifyTsLink(platformDb, sub, new Date(), async () => online), { nickname: "Speaker" });
  assert.equal((await getTsLinkState(platformDb, sub)).linked, true);

  process.env.TS_QUERY_HOST = "127.0.0.1";
  process.env.TS_QUERY_USER = "serveradmin";
  process.env.TS_QUERY_PASSWORD = "pw";
  process.env.TRETU_BADGE_TS_GROUPS_JSON = JSON.stringify({ "play.first-win": 31 });
  await win(sub);
  assert.equal((await jobs("badge.sync.teamspeak")).length, 1);

  const added: [number, number][] = [];
  const fake = {
    connect: async () => undefined,
    disconnect: async () => undefined,
    serverGroupAddClient: async (group: number, dbId: number) => {
      added.push([group, dbId]);
      if (added.length > 1) throw new Error("error id=2561 msg=duplicate entry");
    },
  } as unknown as TeamSpeakQueryClient;
  const ts = createTeamspeakSyncHandler(platformDb, () => fake);
  assert.deepEqual(await runDueJobs({ "badge.sync.teamspeak": ts.handle }), { done: 1, retried: 0, failed: 0 });
  await ts.close();
  assert.deepEqual(added, [[31, 77]]);
});

test("web push: job queued only with VAPID + device; 410 removes the device", async () => {
  const sub = uuid();
  await seedUser(sub, "pusher");
  await savePushSubscription(platformDb, sub, { endpoint: "https://push.example/dev1", keys: { p256dh: "p", auth: "a" } }, null);
  await createNotification(platformDb, { sub, app: "play", type: "invite", title: "Ohne VAPID" });
  assert.equal((await jobs("push.send")).length, 0);

  process.env.WEB_PUSH_PUBLIC_KEY = "pub";
  process.env.WEB_PUSH_PRIVATE_KEY = "priv";
  process.env.WEB_PUSH_SUBJECT = "mailto:admin@tretu.de";
  await createNotification(platformDb, { sub, app: "play", type: "invite", title: "Spiel mit!", url: "/freunde" });
  const [job] = await jobs("push.send");
  assert.ok(job);
  const sent: string[] = [];
  const outcome = await sendPushJob(platformDb, job, async (_s, payload) => {
    sent.push(payload);
    throw Object.assign(new Error("gone"), { statusCode: 410 });
  });
  assert.deepEqual(outcome, { status: "done" });
  assert.equal(JSON.parse(sent[0]).url, "https://tretu.de/freunde");
  assert.equal((await platformDb.select().from(platformPushSubscriptions)).length, 0);
});
