/**
 * TeamSpeak as a linked account of the Tretu-Konto: the /einstellungen link is registered at
 * auth.tretu.de (mocked admin API, signature checked), refusals undo it, and auth's user.updated
 * without links.teamspeak unlinks locally (badge groups taken back).
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { closeDatabase, ctx, envelope, resetDatabase, signedRequest, TEST_APPS, uuid } from "./helpers";
import { POST as postEvents } from "../../src/app/api/v1/events/route";
import { platformBadgeSync, platformJobs, platformNotifications, platformTsLinks } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { runDueJobs, type JobRow } from "../../src/lib/platform/jobs";
import { verifySignature } from "../../src/lib/platform/signing";
import { getTsLinkState, startTsLink } from "../../src/lib/platform/teamspeak";
import { completeTsLink, removeTsLink, tsAuthLinkJob, tsAuthUnlinkJob } from "../../src/lib/platform/ts-auth-link";
import { runDeliveryTick } from "../../src/lib/platform/worker";

const ENV_KEYS = ["TRETU_AUTH_ISSUER", "TRETU_APP_SECRET", "TS_QUERY_HOST", "TS_QUERY_USER", "TS_QUERY_PASSWORD", "TRETU_BADGE_TS_GROUPS_JSON"];
const ISSUER = "https://auth.test";
const realFetch = globalThis.fetch;

type AuthCall = { method: string; path: string; body: Record<string, unknown> };

/** auth admin API mock: verifies the contract §3 signature (as tretu-web) and records calls. */
function authMock(answer: (call: AuthCall) => number = () => 200) {
  const calls: AuthCall[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const headers = init.headers as Record<string, string>;
    const raw = typeof init.body === "string" ? init.body : "";
    assert.equal(u.origin, ISSUER);
    assert.equal(headers["x-tretu-app"], "tretu-web");
    const verified = verifySignature(TEST_APPS["tretu-web"].secret, {
      timestamp: headers["x-tretu-timestamp"],
      method: String(init.method),
      pathWithQuery: u.pathname + u.search,
      body: raw,
      signature: headers["x-tretu-signature"],
    });
    assert.deepEqual(verified, { ok: true }, "signed per contract §3");
    const call = { method: String(init.method), path: u.pathname, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
    calls.push(call);
    const status = answer(call);
    return new Response(JSON.stringify(status < 300 ? { ok: true } : { error: "conflict" }), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

beforeEach(async () => {
  await resetDatabase();
  process.env.TRETU_AUTH_ISSUER = ISSUER;
  process.env.TRETU_APP_SECRET = TEST_APPS["tretu-web"].secret;
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

async function createUser(username: string, links: Record<string, string> = {}, at = new Date(Date.now() - 60_000)) {
  const sub = uuid();
  await send("auth", envelope("auth", sub, "user.created", { username, name: username, links }, at));
  return sub;
}

async function link(sub: string, dbId: number, fetchImpl: ReturnType<typeof authMock>["fetchImpl"], uid = `uid${dbId}+/x=`) {
  const { code } = await startTsLink(platformDb, sub);
  return completeTsLink(platformDb, sub, {
    fetchImpl,
    listClients: async () => [{ clid: "1", clientDatabaseId: dbId, uniqueIdentifier: uid, nickname: `Robin ${code}`, channelId: 1, clientIdleTimeMs: 0 }],
  });
}

async function pending(type: string) {
  return (await platformDb.select().from(platformJobs).where(eq(platformJobs.status, "pending"))).filter((j) => j.type === type);
}

test("completing the TeamSpeak link registers it at auth (signed POST /api/v1/links)", async () => {
  const sub = await createUser("robin");
  const auth = authMock();
  assert.deepEqual(await link(sub, 77, auth.fetchImpl), { nickname: "Robin" });
  assert.deepEqual(auth.calls, [
    { method: "POST", path: "/api/v1/links", body: { sub, provider: "teamspeak", providerAccountId: "uid77+/x=", displayName: "Robin" } },
  ]);
  // The durable job was settled by the immediate attempt.
  assert.equal((await pending("auth.link.teamspeak")).length, 0);
  assert.equal((await getTsLinkState(platformDb, sub)).linked, true);
});

test("auth outage: the registration is retried by the worker until auth answers", async () => {
  const sub = await createUser("outage");
  let down = true;
  const auth = authMock(() => (down ? 503 : 200));
  await link(sub, 77, auth.fetchImpl);
  const [job] = await pending("auth.link.teamspeak");
  assert.ok(job, "queued while auth is down");
  const handlers = { "auth.link.teamspeak": (j: JobRow) => tsAuthLinkJob(platformDb, j, auth.fetchImpl) };
  assert.deepEqual(await runDueJobs(handlers, { now: new Date(Date.now() + 1000) }), { done: 0, retried: 1, failed: 0 });
  down = false;
  const [retry] = await pending("auth.link.teamspeak");
  assert.deepEqual(await runDueJobs(handlers, { now: new Date(retry.nextAttemptAt.getTime() + 1) }), { done: 1, retried: 0, failed: 0 });
  assert.equal(auth.calls.length, 3);
  assert.equal(auth.calls[2].body.providerAccountId, "uid77+/x=");
});

test("auth refuses (409): the local link is undone, groups are taken back and the user is told", async () => {
  const sub = await createUser("taken");
  const auth = authMock(() => 409);
  // A badge group was granted to this identity before (e.g. linked while auth was down).
  await assert.rejects(() => link(sub, 77, auth.fetchImpl), { status: 409, code: "ts_identity_taken_auth" });
  const state = await getTsLinkState(platformDb, sub);
  assert.deepEqual([state.linked, state.error], [false, "ts_identity_taken_auth"]);
  const [row] = await platformDb.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub));
  assert.equal(row.tsUid, null, "identity released for its real owner");
  const [note] = await platformDb.select().from(platformNotifications).where(eq(platformNotifications.sub, sub));
  assert.equal(note.type, "teamspeak");
  assert.equal(note.url, "/einstellungen#teamspeak");
  assert.match(note.body ?? "", /anderen Tretu-Konto/);
  // Starting again clears the reason.
  await startTsLink(platformDb, sub);
  assert.equal((await getTsLinkState(platformDb, sub)).error, null);
});

test("a refusal arriving through the worker job also undoes the link and takes back granted groups", async () => {
  const sub = await createUser("late");
  let answer = 503;
  const auth = authMock(() => answer);
  await link(sub, 77, auth.fetchImpl);
  await platformDb.insert(platformBadgeSync).values({ sub, badgeKey: "play.first-win", target: "teamspeak", status: "done", grantedTo: "77", grantedRef: "31" });
  answer = 409;
  const handlers = { "auth.link.teamspeak": (j: JobRow) => tsAuthLinkJob(platformDb, j, auth.fetchImpl) };
  assert.deepEqual(await runDueJobs(handlers, { now: new Date(Date.now() + 1000) }), { done: 1, retried: 0, failed: 0 });
  assert.equal((await getTsLinkState(platformDb, sub)).error, "ts_identity_taken_auth");
  const [revoke] = await pending("badge.revoke.teamspeak");
  assert.deepEqual([revoke.payload.to, revoke.payload.ref], ["77", "31"]);
  assert.equal((await platformDb.select().from(platformBadgeSync).where(eq(platformBadgeSync.sub, sub))).length, 0);
});

test("unlinking removes the link at auth (DELETE); link → unlink → link converges", async () => {
  const sub = await createUser("toggler");
  let down = true;
  const auth = authMock(() => (down ? 503 : 200));
  await link(sub, 77, auth.fetchImpl);
  await removeTsLink(platformDb, sub);
  await link(sub, 77, auth.fetchImpl);
  down = false;
  const later = new Date(Date.now() + 3 * 3600_000);
  await runDueJobs(
    {
      "auth.link.teamspeak": (j: JobRow) => tsAuthLinkJob(platformDb, j, auth.fetchImpl),
      "auth.unlink.teamspeak": (j: JobRow) => tsAuthUnlinkJob(platformDb, j, auth.fetchImpl),
    },
    { now: later }
  );
  // The unlink job saw the newer link and did not remove it at auth.
  // Calls 0 and 1: the immediate attempts while auth was down; the rest come from the jobs.
  const after = auth.calls.slice(2);
  assert.ok(after.every((c) => c.method === "POST"), JSON.stringify(after));
  assert.ok(after.length >= 1);

  await removeTsLink(platformDb, sub);
  const [unlink] = await pending("auth.unlink.teamspeak");
  assert.deepEqual(unlink.payload, { sub });
  await runDueJobs({ "auth.unlink.teamspeak": (j: JobRow) => tsAuthUnlinkJob(platformDb, j, auth.fetchImpl) });
  assert.deepEqual(auth.calls.at(-1), { method: "DELETE", path: "/api/v1/links", body: { sub, provider: "teamspeak" } });
});

test("without the auth admin API configured, nothing is queued and linking still works", async () => {
  delete process.env.TRETU_AUTH_ISSUER;
  const sub = await createUser("offline");
  const auth = authMock();
  await link(sub, 77, auth.fetchImpl);
  await removeTsLink(platformDb, sub);
  assert.equal(auth.calls.length, 0);
  assert.equal((await platformDb.select().from(platformJobs)).filter((j) => j.type.startsWith("auth.")).length, 0);
});

test("auth's user.updated without links.teamspeak (unlinked in Mein Konto) unlinks locally and takes back groups", async () => {
  const t0 = Date.now() - 60_000;
  const sub = await createUser("kontouser", {}, new Date(t0));
  const auth = authMock();
  await link(sub, 77, auth.fetchImpl);
  await platformDb.insert(platformBadgeSync).values({ sub, badgeKey: "play.first-win", target: "teamspeak", status: "done", grantedTo: "77", grantedRef: "31" });

  // An event that predates the registration (no teamspeak yet) changes nothing.
  await send("auth", envelope("auth", sub, "user.updated", { username: "kontouser", links: {} }, new Date(t0 + 1000)));
  assert.equal((await getTsLinkState(platformDb, sub)).linked, true);
  // auth confirms the link …
  await send("auth", envelope("auth", sub, "user.updated", { username: "kontouser", links: { teamspeak: "uid77+/x=" } }, new Date(t0 + 2000)));
  assert.equal((await getTsLinkState(platformDb, sub)).linked, true);
  // … and later the user removes it in Mein Konto.
  await send("auth", envelope("auth", sub, "user.updated", { username: "kontouser", links: {} }, new Date(t0 + 3000)));
  assert.equal((await getTsLinkState(platformDb, sub)).linked, false);
  assert.equal((await platformDb.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub))).length, 0);
  const [revoke] = await pending("badge.revoke.teamspeak");
  assert.deepEqual([revoke.payload.to, revoke.payload.ref, revoke.payload.reason], ["77", "31", "identity.changed"]);
  assert.equal((await pending("auth.unlink.teamspeak")).length, 0, "auth already removed it: no DELETE back");
});

test("the worker tick delivers queued auth link jobs (global fetch mocked)", async () => {
  const sub = await createUser("ticker");
  let down = true;
  const auth = authMock(() => (down ? 503 : 200));
  await link(sub, 77, auth.fetchImpl);
  down = false;
  await platformDb.update(platformJobs).set({ nextAttemptAt: new Date(0) });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.startsWith(ISSUER)) return auth.fetchImpl(href, init ?? {});
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  delete process.env.TS_QUERY_HOST;
  await runDeliveryTick();
  assert.equal((await pending("auth.link.teamspeak")).length, 0);
  assert.equal(auth.calls.at(-1)?.method, "POST");
});
