import assert from "node:assert/strict";
import test from "node:test";

import { formatDurationGerman } from "../src/lib/teamspeak/format-duration";
import { currentPeriodKey, currentWeekKey, isoWeekKeyFromYmd } from "../src/lib/teamspeak/period";
import {
  advanceRankProgress,
  formatRankLabel,
  getLevel100Threshold,
  getPrestigeTiersUpTo,
  MAX_PRESTIGE,
  resolveLevelFromCycleSeconds,
} from "../src/lib/teamspeak/prestige-progress";
import { parseRankupDefinition } from "../src/lib/teamspeak/rank-definition";
import type { DbRankTier } from "../src/lib/teamspeak/ranks";

function mockLevelTier(level: number, seconds: number, sgid: number): DbRankTier {
  return {
    id: level,
    tierKind: "level",
    sortOrder: level - 1,
    levelNumber: level,
    prestigeLevel: null,
    name: `Level ${level}`,
    minTotalSeconds: seconds,
    serverGroupId: sgid,
    removePreviousGroup: true,
    prestigeFlag: false,
  };
}

function mockPrestigeTier(prestige: number, sgid: number): DbRankTier {
  return {
    id: 100 + prestige,
    tierKind: "prestige",
    sortOrder: prestige,
    levelNumber: null,
    prestigeLevel: prestige,
    name: `Prestige ${prestige}`,
    minTotalSeconds: 0,
    serverGroupId: sgid,
    removePreviousGroup: true,
    prestigeFlag: true,
  };
}

const levelTiers = [
  mockLevelTier(1, 60, 23),
  mockLevelTier(2, 240, 24),
  mockLevelTier(100, 1000, 140),
];

const prestigeTiers = [
  mockPrestigeTier(1, 149),
  mockPrestigeTier(2, 150),
  mockPrestigeTier(3, 151),
];

test("resolveLevelFromCycleSeconds: level 0 below first threshold", () => {
  const r = resolveLevelFromCycleSeconds(levelTiers, 30);
  assert.equal(r.level, 0);
  assert.equal(r.tier, null);
});

test("advanceRankProgress: reaching level 100 grants prestige 1 and resets cycle", () => {
  const r = advanceRankProgress({
    prestige: 0,
    cycleOnlineSeconds: 990,
    addedSeconds: 20,
    levelTiers,
    prestigeTiers,
  });
  assert.equal(r.prestige, 1);
  assert.equal(r.cycleOnlineSeconds, 10);
  assert.equal(r.level, 0);
  assert.equal(r.prestigeGained, true);
  assert.equal(r.prestigeTier?.prestigeLevel, 1);
});

test("advanceRankProgress: max prestige stays at level 100", () => {
  const threshold = getLevel100Threshold(levelTiers);
  const r = advanceRankProgress({
    prestige: MAX_PRESTIGE,
    cycleOnlineSeconds: threshold,
    addedSeconds: 0,
    levelTiers,
    prestigeTiers,
  });
  assert.equal(r.prestige, MAX_PRESTIGE);
  assert.equal(r.cycleOnlineSeconds, threshold);
  assert.equal(r.level, 100);
});

test("formatRankLabel shows prestige and level", () => {
  assert.equal(formatRankLabel(2, 47, "Level 47"), "Prestige 2 · Level 47");
  assert.equal(formatRankLabel(1, 0, null), "Prestige 1 · Level 0");
  assert.equal(formatRankLabel(0, 5, "Level 5"), "Level 5");
});

test("getPrestigeTiersUpTo returns stacked prestige tiers 1..N", () => {
  const stack = getPrestigeTiersUpTo(prestigeTiers, 2);
  assert.equal(stack.length, 2);
  assert.deepEqual(
    stack.map((t) => t.prestigeLevel),
    [1, 2]
  );
  assert.equal(getPrestigeTiersUpTo(prestigeTiers, 0).length, 0);
});

test("parseRankupDefinition parses seconds=>sgid=>flag", () => {
  const tiers = parseRankupDefinition("60=>23=>0,240=>24=>0,1020=>26=>0");
  assert.equal(tiers.length, 3);
  assert.equal(tiers[0]?.minTotalSeconds, 60);
});

test("formatDurationGerman renders days and hours", () => {
  const text = formatDurationGerman(90061);
  assert.match(text, /1 Tag/);
});

test("currentPeriodKey uses YYYY-MM format", () => {
  const key = currentPeriodKey(new Date("2026-06-15T12:00:00Z"));
  assert.match(key, /^\d{4}-\d{2}$/);
});

test("currentWeekKey uses ISO week format", () => {
  assert.equal(isoWeekKeyFromYmd(2026, 6, 15), "2026-W25");
  const key = currentWeekKey(new Date("2026-06-15T12:00:00Z"));
  assert.match(key, /^\d{4}-W\d{2}$/);
});
