import assert from "node:assert/strict";
import test from "node:test";

import { closeTestDatabase, resetTestDatabase } from "./helpers/test-db";

import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { tsServerSnapshots } from "../src/db/schema";
import { snapshotBucketSql } from "../src/lib/teamspeak/snapshot-buckets";

async function seed(timestamps: number[]) {
  await db.delete(tsServerSnapshots);
  await db.insert(tsServerSnapshots).values(timestamps.map((seconds) => ({ recordedAt: new Date(seconds * 1000), onlineClients: 3 })));
}

async function buckets(granularity: "hour" | "day") {
  const expr = sql.raw(snapshotBucketSql(granularity));
  const rows = await db
    .select({ bucket: sql<string>`${expr}` })
    .from(tsServerSnapshots)
    .groupBy(expr)
    .orderBy(expr);
  return rows.map((row) => row.bucket);
}

test.before(async () => {
  await resetTestDatabase();
});

test.after(async () => {
  await closeTestDatabase();
});

test("day buckets keep each calendar day", async () => {
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;
  await seed(Array.from({ length: 30 }, (_, index) => now - index * day));

  const days = await buckets("day");
  assert.equal(days.length, 30);
  assert.equal(days.at(-1), new Date(now * 1000).toISOString().slice(0, 10));
  assert.notEqual(days[0]?.slice(0, 4), "1970");
});

test("hour buckets stay inside the sampled day (UTC)", async () => {
  const start = Math.floor(Date.UTC(2026, 8, 28, 0, 15) / 1000);
  const hour = 60 * 60;
  await seed(Array.from({ length: 6 }, (_, index) => start + index * hour));

  assert.deepEqual(await buckets("hour"), [
    "2026-09-28T00:00:00",
    "2026-09-28T01:00:00",
    "2026-09-28T02:00:00",
    "2026-09-28T03:00:00",
    "2026-09-28T04:00:00",
    "2026-09-28T05:00:00",
  ]);
});
