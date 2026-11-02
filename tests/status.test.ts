/** Status page building blocks without a database: targets, classification, alert state machine, messages. */
import assert from "node:assert/strict";
import test from "node:test";

import { alertMessage, describeError, discordWebhookUrl, formatDuration, nextServiceState, type ServiceRow } from "../src/lib/status/alerts";
import { classifyResponse, SLOW_MS, type CheckResult } from "../src/lib/status/check";
import { berlinDay, lastDays, lastHours } from "../src/lib/status/read";
import { parseStatusTargets } from "../src/lib/status/targets";

const ok = (ms = 50): CheckResult => ({ state: "up", responseMs: ms, httpStatus: 200, error: null });
const down = (error = "timeout"): CheckResult => ({ state: "down", responseMs: null, httpStatus: null, error });
const degraded = (error = "checks:db"): CheckResult => ({ state: "degraded", responseMs: 80, httpStatus: 503, error });

test("targets default to the contract's six services", () => {
  const { targets, error } = parseStatusTargets(undefined);
  assert.equal(error, undefined);
  assert.deepEqual(
    targets.map((t) => [t.id, t.name, t.host, t.url]),
    [
      ["tretu-web", "Website", "tretu.de", "https://tretu.de/api/health"],
      ["auth", "Tretu-Konto", "auth.tretu.de", "https://auth.tretu.de/api/health"],
      ["saga", "Saga", "saga.tretu.de", "https://saga.tretu.de/api/health"],
      ["play", "Play", "play.tretu.de", "https://play.tretu.de/api/health"],
      ["hollowmere", "Hollowmere", "hollowmere.tretu.de", "https://hollowmere.tretu.de/api/health"],
      ["mc-dashboard", "Minecraft-Dashboard", "mc.tretu.de", "https://mc.tretu.de/api/health"],
    ]
  );
});

test("targets from TRETU_STATUS_TARGETS_JSON: custom list, [] = off, invalid = defaults with an error", () => {
  const custom = parseStatusTargets(
    '[{"id":"saga","url":"http://127.0.0.1:3038/api/health"},{"id":"extra","url":"https://x.example/h","name":"Extra"},{"id":"mc","url":"http://10.0.0.2/h","host":"mc.example"}]'
  );
  assert.deepEqual(
    custom.targets.map((t) => [t.id, t.name, t.host, t.url]),
    [
      ["saga", "Saga", "saga.tretu.de", "http://127.0.0.1:3038/api/health"],
      ["extra", "Extra", "x.example", "https://x.example/h"],
      ["mc", "mc", "mc.example", "http://10.0.0.2/h"],
    ]
  );
  assert.deepEqual(parseStatusTargets("[]").targets, []);
  for (const bad of ["{", '[{"id":"Saga!","url":"https://x"}]', '[{"id":"a","url":"ftp://x"}]', '[{"id":"a","url":"https://x"},{"id":"a","url":"https://y"}]']) {
    const parsed = parseStatusTargets(bad);
    assert.ok(parsed.error, bad);
    assert.equal(parsed.targets.length, 6, bad);
  }
});

test("classification: HTTP code + JSON status", () => {
  assert.deepEqual(classifyResponse(200, '{"status":"ok","checks":{"db":"ok"}}', 40), ok(40));
  assert.deepEqual(classifyResponse(503, '{"status":"error","checks":{"db":"error","migrations":"ok","worker":"off"}}', 30), {
    state: "degraded",
    responseMs: 30,
    httpStatus: 503,
    error: "checks:db",
  });
  assert.equal(classifyResponse(200, '{"status":"maintenance"}', 30).error, "status:maintenance");
  assert.deepEqual(classifyResponse(200, "<html>hi</html>", 30), { state: "degraded", responseMs: 30, httpStatus: 200, error: "invalid_json" });
  assert.deepEqual(classifyResponse(502, "<html>Bad Gateway</html>", 12), { state: "down", responseMs: 12, httpStatus: 502, error: "http_502" });
  assert.equal(classifyResponse(200, '{"status":"ok"}', SLOW_MS + 1).state, "degraded");
  assert.equal(classifyResponse(200, '["ok"]', 5).error, "invalid_json");
});

test("alerts: a single blip is silent, two bad checks alert once, recovery alerts once", () => {
  let row: ServiceRow | null = null;
  const at = (min: number) => new Date(Date.UTC(2026, 10, 2, 12, min));
  const step = (result: CheckResult, min: number) => {
    const next = nextServiceState(row, result, at(min));
    row = next.row;
    return next.change;
  };
  assert.equal(step(ok(), 0), null);
  assert.equal(step(down(), 1), null, "one failed check");
  assert.equal(step(ok(), 2), null, "back before an alert: nothing to recover from");
  assert.equal(step(down(), 3), null);
  assert.deepEqual(step(down(), 4), { kind: "down", problemSince: at(3), error: "timeout" });
  assert.equal(step(down(), 5), null, "no repeat");
  assert.equal(step(down(), 6), null);
  assert.equal(step(degraded(), 7), null, "first degraded check after down");
  assert.deepEqual(step(degraded(), 8), { kind: "degraded", problemSince: at(3), error: "checks:db" });
  assert.deepEqual(step(ok(), 9), { kind: "recovered", problemSince: at(3), error: null });
  assert.equal(step(ok(), 10), null);
  assert.equal(row!.consecutive, 2);
  assert.equal(row!.alertedState, "up");
});

test("alerts: a service whose very first checks fail is announced", () => {
  const first = nextServiceState(null, down("connection"), new Date(0));
  assert.equal(first.change, null);
  const second = nextServiceState(first.row, down("connection"), new Date(60_000));
  assert.equal(second.change?.kind, "down");
});

test("German alert messages", () => {
  const service = { name: "Saga", host: "saga.tretu.de" };
  const at = new Date(Date.UTC(2026, 10, 2, 13, 0));
  assert.equal(
    alertMessage(service, { kind: "down", problemSince: at, error: "timeout" }, at, "https://tretu.de/status"),
    "**Saga** (saga.tretu.de) ist ausgefallen – keine Antwort innerhalb von 5 Sekunden. https://tretu.de/status"
  );
  assert.equal(
    alertMessage(service, { kind: "degraded", problemSince: at, error: "checks:db,migrations" }, at, "https://tretu.de/status"),
    "**Saga** (saga.tretu.de) ist gestört – Prüfung fehlgeschlagen: db, migrations. https://tretu.de/status"
  );
  assert.equal(
    alertMessage(service, { kind: "recovered", problemSince: new Date(at.getTime() - 75 * 60_000), error: null }, at, "https://tretu.de/status"),
    "**Saga** (saga.tretu.de) läuft wieder (nach 1 Std. 15 Min.)."
  );
  assert.equal(describeError("http_502"), "HTTP 502");
  assert.equal(describeError(null), null);
  assert.equal(formatDuration(30_000), "1 Min.");
  assert.equal(formatDuration(26 * 3600_000), "1 Tg. 2 Std.");
});

test("only Discord webhook URLs are used", () => {
  assert.equal(discordWebhookUrl({}), null);
  assert.equal(discordWebhookUrl({ TRETU_STATUS_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc" }), "https://discord.com/api/webhooks/1/abc");
  assert.equal(discordWebhookUrl({ TRETU_STATUS_DISCORD_WEBHOOK_URL: "https://evil.example/api/webhooks/1/abc" }), null);
  assert.equal(discordWebhookUrl({ TRETU_STATUS_DISCORD_WEBHOOK_URL: "http://discord.com/api/webhooks/1/abc" }), null);
});

test("bar ranges: 24 hours and 90 Berlin calendar days, oldest first", () => {
  const now = new Date("2026-03-29T10:30:00Z"); // the day the clocks change in Germany
  const hours = lastHours(now, 24);
  assert.equal(hours.length, 24);
  assert.equal(hours.at(-1)!.toISOString(), "2026-03-29T10:00:00.000Z");
  assert.equal(hours[0]!.toISOString(), "2026-03-28T11:00:00.000Z");
  assert.equal(berlinDay(new Date("2026-03-28T23:30:00Z")), "2026-03-29");
  const days = lastDays("2026-03-01", 90);
  assert.equal(days.length, 90);
  assert.equal(days.at(-1), "2026-03-01");
  assert.equal(days.at(-2), "2026-02-28");
  assert.equal(days[0], "2025-12-02");
});
