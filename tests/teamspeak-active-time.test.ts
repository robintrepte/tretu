import assert from "node:assert/strict";
import test from "node:test";

import {
  computeActivityCredit,
  isAfkChannelName,
  parseAfkChannelMatchers,
} from "../src/lib/teamspeak/active-time";

const config = {
  idleGraceSec: 300,
  afkChannelMatchers: ["afk"],
};

test("computeActivityCredit: active while idle within 5 minutes", () => {
  const credit = computeActivityCredit(30, 120_000, "Lounge [1]", config);
  assert.equal(credit.activeSeconds, 30);
  assert.equal(credit.idleSeconds, 0);
  assert.equal(credit.excludedAfk, false);
});

test("computeActivityCredit: idle after 5 minutes earns no rank time", () => {
  const credit = computeActivityCredit(30, 301_000, "Lounge [1]", config);
  assert.equal(credit.activeSeconds, 0);
  assert.equal(credit.idleSeconds, 30);
});

test("computeActivityCredit: AFK channel excluded entirely", () => {
  const credit = computeActivityCredit(30, 0, "Rage Bunker / AFK Channel", config);
  assert.equal(credit.activeSeconds, 0);
  assert.equal(credit.idleSeconds, 0);
  assert.equal(credit.excludedAfk, true);
});

test("isAfkChannelName matches case-insensitively", () => {
  assert.equal(isAfkChannelName("Rage Bunker / AFK Channel", ["afk"]), true);
  assert.equal(isAfkChannelName("Lounge [1]", ["afk"]), false);
});

test("parseAfkChannelMatchers falls back to afk", () => {
  assert.deepEqual(parseAfkChannelMatchers(""), ["afk"]);
  assert.deepEqual(parseAfkChannelMatchers("afk,away"), ["afk", "away"]);
});
