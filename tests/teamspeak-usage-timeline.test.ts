import assert from "node:assert/strict";
import test from "node:test";

import {
  berlinBucketKey,
  buildUsageTimeline,
  formatBerlinBucketLabel,
} from "../src/lib/teamspeak/usage-timeline";

test("hour buckets use Europe/Berlin instead of UTC", () => {
  const utcEvening = new Date("2026-09-28T16:00:00Z");
  assert.equal(berlinBucketKey(utcEvening, "hour"), "2026-09-28T18:00:00");
  assert.match(formatBerlinBucketLabel("2026-09-28T18:00:00", "hour"), /18:00/);
});

test("day buckets follow the Berlin calendar across midnight UTC", () => {
  const lateUtc = new Date("2026-09-27T23:30:00Z");
  assert.equal(berlinBucketKey(lateUtc, "day"), "2026-09-28");
  assert.equal(formatBerlinBucketLabel("2026-09-28", "day"), "28.09.");
});

test("winter time stays on CET", () => {
  const utcEvening = new Date("2026-01-21T18:00:00Z");
  assert.equal(berlinBucketKey(utcEvening, "hour"), "2026-01-21T19:00:00");
});

test("missing hours are filled so the range stays continuous", () => {
  const since = new Date("2026-09-28T10:00:00Z");
  const now = new Date("2026-09-28T12:30:00Z");
  const { points, measured } = buildUsageTimeline({
    since,
    now,
    granularity: "hour",
    samples: [
      { bucket: "2026-09-28T10:00:00", total: 12, samples: 3 },
      { bucket: "2026-09-28T12:00:00", total: 5, samples: 1 },
    ],
  });

  assert.deepEqual(
    points.map((point) => [point.bucket, point.online]),
    [
      ["2026-09-28T12:00:00", 4],
      ["2026-09-28T13:00:00", 0],
      ["2026-09-28T14:00:00", 5],
    ]
  );
  assert.deepEqual(measured, [4, 5]);
});
