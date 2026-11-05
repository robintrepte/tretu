/**
 * tretu.de/status: health checks against a local server (healthy, degraded, timeout, bad JSON, down), rollups and
 * pruning, Discord alerts on state changes (mocked), the overview the page reads and GET /api/status.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { closeDatabase, resetDatabase } from "./helpers";
import { platformStatusChecks, platformStatusRollups, platformStatusServices } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { runMaintenanceTick } from "../../src/lib/platform/worker";
import { checkTarget } from "../../src/lib/status/check";
import { clearStatusCache, getStatusOverview, loadStatusOverview } from "../../src/lib/status/read";
import { pruneStatus, recordCheck } from "../../src/lib/status/store";
import { runStatusTick } from "../../src/lib/status/worker";

let server: Server;
let base = "";

before(async () => {
  server = createServer((req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    switch (req.url) {
      case "/healthy":
        return json(200, { status: "ok", app: "saga", version: "1.0.0", time: new Date().toISOString(), checks: { db: "ok" } });
      case "/degraded":
        return json(503, { status: "error", app: "play", checks: { db: "error" } });
      case "/html":
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<!doctype html><title>Maintenance</title>");
      case "/badgateway":
        res.writeHead(502, { "content-type": "text/html" });
        return res.end("<html>502 Bad Gateway</html>");
      case "/hang":
        return; // never answers
      default:
        return json(404, { error: "not_found" });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  server.close();
  await closeDatabase();
});
beforeEach(async () => {
  await resetDatabase();
  clearStatusCache();
  delete process.env.TRETU_STATUS_TARGETS_JSON;
  delete process.env.TRETU_STATUS_DISCORD_WEBHOOK_URL;
  delete process.env.TRETU_STATUS_NOTICE;
  delete process.env.TRETU_STATUS_TEAMSPEAK;
  for (const key of ["TS_QUERY_HOST", "TS_QUERY_USER", "TS_QUERY_PASSWORD"]) delete process.env[key];
  // Never the real Minecraft server from a test.
  process.env.TRETU_STATUS_MINECRAFT = "off";
});

test("check: healthy, degraded (503 + JSON), bad JSON, 502 page, timeout, connection refused", async () => {
  const healthy = await checkTarget({ url: `${base}/healthy` });
  assert.equal(healthy.state, "up");
  assert.equal(healthy.httpStatus, 200);
  assert.ok(healthy.responseMs !== null && healthy.responseMs >= 0);

  assert.deepEqual({ ...(await checkTarget({ url: `${base}/degraded` })), responseMs: 0 }, { state: "degraded", responseMs: 0, httpStatus: 503, error: "checks:db" });
  assert.deepEqual({ ...(await checkTarget({ url: `${base}/html` })), responseMs: 0 }, { state: "degraded", responseMs: 0, httpStatus: 200, error: "invalid_json" });
  assert.deepEqual({ ...(await checkTarget({ url: `${base}/badgateway` })), responseMs: 0 }, { state: "down", responseMs: 0, httpStatus: 502, error: "http_502" });

  const started = Date.now();
  assert.deepEqual(await checkTarget({ url: `${base}/hang` }, { timeoutMs: 300 }), { state: "down", responseMs: null, httpStatus: null, error: "timeout" });
  assert.ok(Date.now() - started < 3000, "the timeout is respected");

  assert.deepEqual(await checkTarget({ url: "http://127.0.0.1:9/api/health" }), { state: "down", responseMs: null, httpStatus: null, error: "connection" });

  const controller = new AbortController();
  const pending = checkTarget({ url: `${base}/hang` }, { signal: controller.signal });
  controller.abort();
  assert.equal((await pending).error, "timeout", "shutdown aborts a running check");
});

test("rollups: hourly and Berlin-daily counts and response times; pruning keeps 7 days raw, 90 days rollups", async () => {
  const at = (iso: string) => new Date(iso);
  const up = (ms: number) => ({ state: "up" as const, responseMs: ms, httpStatus: 200, error: null });
  await recordCheck(platformDb, "saga", up(100), at("2026-11-01T22:58:00Z")); // 23:58 in Berlin
  await recordCheck(platformDb, "saga", up(300), at("2026-11-01T22:59:00Z"));
  await recordCheck(platformDb, "saga", { state: "down", responseMs: null, httpStatus: null, error: "timeout" }, at("2026-11-01T23:00:00Z")); // 00:00 next day
  await recordCheck(platformDb, "saga", { state: "degraded", responseMs: 200, httpStatus: 503, error: "checks:db" }, at("2026-11-01T23:01:00Z"));

  const rows = await platformDb.select().from(platformStatusRollups).orderBy(platformStatusRollups.period, platformStatusRollups.bucketStart);
  const view = rows.map((r) => [r.period, r.bucketStart.toISOString(), r.checks, r.up, r.degraded, r.down, r.responseMsSum, r.responseCount]);
  assert.deepEqual(view, [
    ["day", "2026-10-31T23:00:00.000Z", 2, 2, 0, 0, 400, 2], // 1 Nov (CET)
    ["day", "2026-11-01T23:00:00.000Z", 2, 0, 1, 1, 200, 1], // 2 Nov
    ["hour", "2026-11-01T22:00:00.000Z", 2, 2, 0, 0, 400, 2],
    ["hour", "2026-11-01T23:00:00.000Z", 2, 0, 1, 1, 200, 1],
  ]);
  const [svc] = await platformDb.select().from(platformStatusServices);
  assert.equal(svc!.state, "degraded");
  assert.equal(svc!.lastError, "checks:db");
  assert.equal((await platformDb.select().from(platformStatusChecks)).length, 4);

  // An old raw check and an old rollup are removed, recent ones stay.
  const now = at("2026-11-02T12:00:00Z");
  await recordCheck(platformDb, "play", up(50), at("2026-10-25T11:00:00Z")); // 7 days + 1 h ago
  await platformDb.insert(platformStatusRollups).values({ service: "play", period: "day", bucketStart: at("2026-08-01T22:00:00Z"), checks: 1, up: 1 });
  const pruned = await pruneStatus(platformDb, now);
  assert.equal(pruned.checks, 1);
  assert.equal(pruned.rollups, 1);
  assert.equal((await platformDb.select().from(platformStatusChecks)).length, 4);
  const playRollups = await platformDb.select().from(platformStatusRollups).where(eq(platformStatusRollups.service, "play"));
  assert.deepEqual(playRollups.map((r) => r.period).sort(), ["day", "hour"], "rollups of the pruned raw check are kept");

  // The worker's maintenance pass prunes too.
  await recordCheck(platformDb, "play", up(50), at("2020-01-01T00:00:00Z"));
  await runMaintenanceTick(now);
  assert.equal((await platformDb.select().from(platformStatusChecks).where(eq(platformStatusChecks.service, "play"))).length, 0);
  assert.equal(
    (await platformDb.select().from(platformStatusRollups).where(and(eq(platformStatusRollups.service, "play"), eq(platformStatusRollups.period, "day")))).length,
    1
  );
});

/** fetch stand-in: health URLs answer from `answers`, Discord posts are collected. */
function fakeFetch(answers: Record<string, "up" | "down" | "degraded">, posts: { url: string; body: { content: string; allowed_mentions: unknown } }[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://discord.com/")) {
      posts.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 204 });
    }
    const state = answers[url];
    if (state === "up") return Response.json({ status: "ok", checks: { db: "ok" } });
    if (state === "degraded") return Response.json({ status: "error", checks: { db: "error" } }, { status: 503 });
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}

test("worker tick: alerts on Discord only when a service changes state (2 failed checks / recovered)", async () => {
  process.env.TRETU_STATUS_TARGETS_JSON = JSON.stringify([
    { id: "saga", url: "https://saga.test/api/health" },
    { id: "play", url: "https://play.test/api/health" },
  ]);
  process.env.TRETU_STATUS_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1/token";
  const answers: Record<string, "up" | "down" | "degraded"> = { "https://saga.test/api/health": "up", "https://play.test/api/health": "up" };
  const posts: { url: string; body: { content: string; allowed_mentions: unknown } }[] = [];
  const fetchImpl = fakeFetch(answers, posts);
  const minute = (n: number) => new Date(Date.UTC(2026, 10, 2, 12, n));

  assert.equal(await runStatusTick(minute(0), { fetchImpl }), 2);
  answers["https://saga.test/api/health"] = "down";
  await runStatusTick(minute(1), { fetchImpl });
  assert.equal(posts.length, 0, "one failed check is not an outage");
  await runStatusTick(minute(2), { fetchImpl });
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.body.content, "**Saga** (saga.tretu.de) ist ausgefallen – keine Verbindung. https://tretu.de/status");
  assert.deepEqual(posts[0]!.body.allowed_mentions, { parse: [] });
  await runStatusTick(minute(3), { fetchImpl });
  await runStatusTick(minute(4), { fetchImpl });
  assert.equal(posts.length, 1, "no spam while it stays down");

  answers["https://saga.test/api/health"] = "up";
  answers["https://play.test/api/health"] = "degraded";
  await runStatusTick(minute(5), { fetchImpl });
  assert.equal(posts.length, 2);
  assert.equal(posts[1]!.body.content, "**Saga** (saga.tretu.de) läuft wieder (nach 4 Min.).");
  await runStatusTick(minute(6), { fetchImpl });
  assert.equal(posts.length, 3);
  assert.match(posts[2]!.body.content, /^\*\*Play\*\* \(play\.tretu\.de\) ist gestört – Prüfung fehlgeschlagen: db\./);

  const checks = await platformDb.select().from(platformStatusChecks);
  assert.equal(checks.length, 14);

  // Without a webhook nothing is posted, the state is still tracked.
  delete process.env.TRETU_STATUS_DISCORD_WEBHOOK_URL;
  answers["https://play.test/api/health"] = "up";
  await runStatusTick(minute(7), { fetchImpl });
  assert.equal(posts.length, 3);
  const [play] = await platformDb.select().from(platformStatusServices).where(eq(platformStatusServices.service, "play"));
  assert.equal(play!.alertedState, "up");

  process.env.TRETU_STATUS_TARGETS_JSON = "[]";
  assert.equal(await runStatusTick(minute(8), { fetchImpl }), 0, "[] switches the checks off");
});

test("overview: states, 24 h / 90 day bars, uptime, stale data, notice", async () => {
  process.env.TRETU_STATUS_TARGETS_JSON = JSON.stringify([
    { id: "saga", url: "https://saga.test/api/health" },
    { id: "play", url: "https://play.test/api/health" },
    { id: "hollowmere", url: "https://hollowmere.test/api/health" },
  ]);
  const now = new Date("2026-11-02T12:30:00Z");
  const up = { state: "up" as const, responseMs: 120, httpStatus: 200, error: null };
  const downResult = { state: "down" as const, responseMs: null, httpStatus: null, error: "timeout" };
  for (let i = 0; i < 4; i++) await recordCheck(platformDb, "saga", i === 1 ? downResult : up, new Date(now.getTime() - (4 - i) * 60_000));
  await recordCheck(platformDb, "play", up, new Date("2026-10-20T10:00:00Z"));
  await recordCheck(platformDb, "play", downResult, new Date(now.getTime() - 60_000));

  const overview = await loadStatusOverview(platformDb, now);
  assert.equal(overview.status, "down");
  assert.deepEqual(
    overview.services.map((s) => s.host),
    ["saga.tretu.de", "play.tretu.de", "hollowmere.tretu.de"],
    "known services show their public host, not the check URL"
  );
  assert.equal(overview.updatedAt, new Date(now.getTime() - 60_000).toISOString());
  assert.equal(overview.stale, false);
  const [saga, play, hollowmere] = overview.services;
  assert.equal(saga!.name, "Saga");
  assert.equal(saga!.state, "up");
  assert.equal(saga!.responseMs, 120);
  assert.equal(saga!.hours.length, 24);
  assert.equal(saga!.days.length, 90);
  assert.equal(saga!.hours.at(-1)!.checks, 4);
  assert.equal(saga!.uptime24h, 75);
  assert.equal(saga!.avgResponseMs24h, 120);
  assert.equal(saga!.days.at(-1)!.start, "2026-11-02");
  assert.equal(play!.state, "down");
  assert.equal(play!.uptime90d, 50);
  assert.equal(play!.uptime24h, 0);
  assert.equal(play!.days.find((d) => d.start === "2026-10-20")!.up, 1);
  assert.equal(hollowmere!.state, "unknown");
  assert.equal(hollowmere!.uptime24h, null);

  const later = await loadStatusOverview(platformDb, new Date(now.getTime() + 10 * 60_000));
  assert.equal(later.stale, true, "no checks for 10 minutes: the worker is not running");
  assert.equal(later.updatedAt, overview.updatedAt, "the page still shows the last state with its time");

  process.env.TRETU_STATUS_NOTICE = "  Wartung am Sonntag ab 22 Uhr  ";
  assert.equal((await loadStatusOverview(platformDb, now)).notice, "Wartung am Sonntag ab 22 Uhr");
});

test("GET /api/status: public JSON from the database, cached for 30 s", async () => {
  process.env.TRETU_STATUS_TARGETS_JSON = JSON.stringify([{ id: "saga", url: "https://saga.test/api/health" }]);
  await recordCheck(platformDb, "saga", { state: "up", responseMs: 42, httpStatus: 200, error: null }, new Date());
  const { GET } = await import("../../src/app/api/status/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /public, max-age=30/);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const body = (await res.json()) as { status: string; stale: boolean; services: { id: string; state: string; responseMs: number; hours: unknown[]; days: unknown[] }[] };
  assert.equal(body.status, "up");
  assert.equal(body.stale, false);
  assert.deepEqual(
    body.services.map((s) => [s.id, s.state, s.responseMs, s.hours.length, s.days.length]),
    [["saga", "up", 42, 24, 90]]
  );
  assert.ok(!JSON.stringify(body).includes("saga.test/api/health"), "check URLs are not published");

  // Cached: a new check is not visible until the cache expires.
  await recordCheck(platformDb, "saga", { state: "down", responseMs: null, httpStatus: null, error: "timeout" }, new Date(Date.now() + 1000));
  assert.equal((await getStatusOverview()).services[0]!.state, "up");
  assert.equal((await getStatusOverview(new Date(Date.now() + 31_000))).services[0]!.state, "down");
});

test("game servers: TeamSpeak users (ServerQuery stub) and Minecraft down are stored and shown", async () => {
  process.env.TRETU_STATUS_TARGETS_JSON = "[]";
  process.env.TRETU_STATUS_MINECRAFT = "127.0.0.1:9";
  Object.assign(process.env, { TS_QUERY_HOST: "127.0.0.1", TS_QUERY_USER: "serveradmin", TS_QUERY_PASSWORD: "secret" });
  const createTsClient = () => ({
    connect: async () => {},
    clientList: async () => [{}, {}] as never,
    disconnect: async () => {},
  });
  const now = new Date();
  assert.equal(await runStatusTick(now, { createTsClient }), 2);
  const services = await platformDb.select().from(platformStatusServices).orderBy(platformStatusServices.service);
  assert.deepEqual(
    services.map((s) => [s.service, s.state, s.usersOnline, s.usersMax, s.lastError]),
    [
      ["minecraft", "down", null, null, "connection"],
      ["teamspeak", "up", 2, null, null],
    ]
  );
  await recordCheck(platformDb, "minecraft", { state: "up", responseMs: 12, httpStatus: null, error: null, usersOnline: 5, usersMax: 40 }, new Date(now.getTime() + 60_000));
  const overview = await loadStatusOverview(platformDb, new Date(now.getTime() + 61_000));
  assert.deepEqual(
    overview.services.map((s) => [s.id, s.kind, s.name, s.host, s.state, s.usersOnline, s.usersMax]),
    [
      ["minecraft", "minecraft", "Minecraft-Server", "127.0.0.1", "up", 5, 40],
      ["teamspeak", "teamspeak", "TeamSpeak", "tretu.de", "up", 2, null],
    ]
  );
});

test("maintenance: no Discord alerts while it lasts, shown as maintenance, excluded from the overall status", async () => {
  // Around the real time: /api/status below asks with the real clock, so the maintenance must still be running then
  // (it ends at minute(5), at least a minute from now).
  const base = Math.floor(Date.now() / 60_000) * 60_000 - 3 * 60_000;
  const minute = (n: number) => new Date(base + n * 60_000);
  const until = minute(5);
  process.env.TRETU_STATUS_TARGETS_JSON = JSON.stringify([
    { id: "saga", url: "https://saga.test/api/health", maintenance: "Umzug auf einen neuen Server", until: until.toISOString() },
    { id: "play", url: "https://play.test/api/health", excludeFromOverall: true },
    { id: "auth", url: "https://auth.test/api/health" },
  ]);
  process.env.TRETU_STATUS_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1/token";
  const answers: Record<string, "up" | "down" | "degraded"> = {
    "https://saga.test/api/health": "down",
    "https://play.test/api/health": "down",
    "https://auth.test/api/health": "up",
  };
  const posts: { url: string; body: { content: string; allowed_mentions: unknown } }[] = [];
  const fetchImpl = fakeFetch(answers, posts);

  for (let m = 0; m < 4; m++) await runStatusTick(minute(m), { fetchImpl });
  // play (only excluded from the overall status) still alerts; saga (maintenance) does not.
  assert.deepEqual(posts.map((p) => p.body.content.split(" ")[0]), ["**Play**"]);

  const overview = await loadStatusOverview(platformDb, minute(4));
  assert.equal(overview.status, "up", "saga in maintenance and play excluded: only auth counts");
  const byId = Object.fromEntries(overview.services.map((s) => [s.id, s]));
  assert.deepEqual(
    [byId.saga!.state, byId.saga!.checkState, byId.saga!.inOverall, byId.saga!.maintenance],
    ["maintenance", "down", false, { note: "Umzug auf einen neuen Server", until: until.toISOString() }]
  );
  assert.deepEqual([byId.play!.state, byId.play!.inOverall, byId.play!.maintenance], ["down", false, null]);
  assert.equal(byId.saga!.uptime24h, 0, "checks during maintenance are still recorded");

  // The same in /api/status.
  const { GET } = await import("../../src/app/api/status/route");
  clearStatusCache();
  const body = (await (await GET()).json()) as { services: { id: string; state: string; maintenance: unknown }[] };
  assert.deepEqual(
    body.services.map((s) => [s.id, s.state]),
    [
      ["saga", "maintenance"],
      ["play", "down"],
      ["auth", "up"],
    ]
  );

  // The maintenance ends at `until` while saga is still down: announced right away, counted again.
  await runStatusTick(minute(5), { fetchImpl });
  assert.equal(posts.length, 2);
  assert.match(posts[1]!.body.content, /^\*\*Saga\*\* \(saga\.tretu\.de\) ist ausgefallen/);
  const after = await loadStatusOverview(platformDb, minute(5));
  assert.equal(after.status, "down");
  assert.equal(after.services[0]!.state, "down");
  assert.equal(after.services[0]!.maintenance, null);

  // Everything in maintenance: the overall status says so.
  process.env.TRETU_STATUS_TARGETS_JSON = JSON.stringify([{ id: "saga", url: "https://saga.test/api/health", maintenance: true }]);
  assert.equal((await loadStatusOverview(platformDb, minute(6))).status, "maintenance");
});
