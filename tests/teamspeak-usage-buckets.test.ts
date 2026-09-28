import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { snapshotBucketSql } from "../src/lib/teamspeak/snapshot-buckets";

function seed(db: Database.Database, timestamps: number[]) {
  db.exec(
    "create table ts_server_snapshots (recorded_at integer not null, online_clients integer not null)"
  );
  const insert = db.prepare(
    "insert into ts_server_snapshots (recorded_at, online_clients) values (?, 3)"
  );
  for (const recordedAt of timestamps) insert.run(recordedAt);
}

test("day buckets keep each calendar day instead of collapsing to 1970-01-21", () => {
  const db = new Database(":memory:");
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;
  seed(
    db,
    Array.from({ length: 30 }, (_, index) => now - index * day)
  );

  const broken = db
    .prepare(
      "select strftime('%Y-%m-%d', recorded_at / 1000, 'unixepoch') as bucket from ts_server_snapshots group by bucket"
    )
    .all() as { bucket: string }[];
  assert.deepEqual(
    broken.map((row) => row.bucket),
    ["1970-01-21"]
  );

  const buckets = db
    .prepare(
      `select ${snapshotBucketSql("day")} as bucket from ts_server_snapshots group by bucket order by bucket`
    )
    .all() as { bucket: string }[];

  assert.equal(buckets.length, 30);
  assert.equal(buckets.at(-1)?.bucket, new Date(now * 1000).toISOString().slice(0, 10));
  assert.notEqual(buckets[0]?.bucket.slice(0, 4), "1970");
});

test("hour buckets stay inside the sampled day", () => {
  const db = new Database(":memory:");
  const start = Math.floor(Date.UTC(2026, 8, 28, 0, 15) / 1000);
  const hour = 60 * 60;
  seed(
    db,
    Array.from({ length: 6 }, (_, index) => start + index * hour)
  );

  const buckets = db
    .prepare(
      `select ${snapshotBucketSql("hour")} as bucket from ts_server_snapshots group by bucket order by bucket`
    )
    .all() as { bucket: string }[];

  assert.deepEqual(
    buckets.map((row) => row.bucket),
    [
      "2026-09-28T00:00:00",
      "2026-09-28T01:00:00",
      "2026-09-28T02:00:00",
      "2026-09-28T03:00:00",
      "2026-09-28T04:00:00",
      "2026-09-28T05:00:00",
    ]
  );
});
