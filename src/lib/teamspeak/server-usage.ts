import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { tsServerSnapshots, tsUsers } from "@/db/schema";
import {
  USAGE_RANGE_HOURS,
  type UsageRange,
} from "@/lib/teamspeak/server-usage-types";

export type { UsageRange } from "@/lib/teamspeak/server-usage-types";
export { USAGE_RANGE_HOURS, USAGE_RANGE_LABELS } from "@/lib/teamspeak/server-usage-types";

const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type BucketGranularity = "hour" | "day";

function resolveRange(input?: UsageRange | number): {
  range: UsageRange;
  hours: number;
  granularity: BucketGranularity;
} {
  if (input === "24h" || input === "7d" || input === "30d") {
    return {
      range: input,
      hours: USAGE_RANGE_HOURS[input],
      granularity: input === "30d" ? "day" : "hour",
    };
  }

  const hours =
    typeof input === "number" && Number.isFinite(input) && input > 0
      ? Math.min(input, USAGE_RANGE_HOURS["30d"])
      : USAGE_RANGE_HOURS["24h"];

  if (hours <= USAGE_RANGE_HOURS["24h"]) {
    return { range: "24h", hours: USAGE_RANGE_HOURS["24h"], granularity: "hour" };
  }
  if (hours <= USAGE_RANGE_HOURS["7d"]) {
    return { range: "7d", hours: USAGE_RANGE_HOURS["7d"], granularity: "hour" };
  }
  return { range: "30d", hours: USAGE_RANGE_HOURS["30d"], granularity: "day" };
}

export type ServerUsagePoint = {
  bucket: string;
  label: string;
  online: number;
};

export type ServerUsageStats = {
  onlineNow: number;
  peakInRange: number;
  averageInRange: number;
};

export type ServerUsageResult = {
  range: UsageRange;
  rangeHours: number;
  generatedAt: string;
  points: ServerUsagePoint[];
  stats: ServerUsageStats;
  hasHistory: boolean;
};

export async function recordServerSnapshot(onlineClients: number): Promise<void> {
  await db.insert(tsServerSnapshots).values({
    recordedAt: new Date(),
    onlineClients: Math.max(0, onlineClients),
  });
}

export async function pruneServerSnapshots(): Promise<void> {
  const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_MS);
  await db.delete(tsServerSnapshots).where(lt(tsServerSnapshots.recordedAt, cutoff));
}

async function countConnectedUsers(): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(tsUsers)
    .where(and(eq(tsUsers.excepted, false), eq(tsUsers.isOnline, true)));
  return Number(row[0]?.count ?? 0);
}

function formatBucketLabel(bucket: string, granularity: BucketGranularity): string {
  const normalized = bucket.includes("T") ? bucket : bucket.replace(" ", "T");
  const date = new Date(
    granularity === "day" && !normalized.includes("T") ? `${normalized}T12:00:00` : normalized
  );
  if (Number.isNaN(date.getTime())) return bucket;

  if (granularity === "day") {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }

  return date.toLocaleString("de-DE", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bucketSql(granularity: BucketGranularity) {
  if (granularity === "day") {
    return sql<string>`strftime('%Y-%m-%d', ${tsServerSnapshots.recordedAt} / 1000, 'unixepoch')`;
  }
  return sql<string>`strftime('%Y-%m-%dT%H:00:00', ${tsServerSnapshots.recordedAt} / 1000, 'unixepoch')`;
}

export function parseUsageRangeParam(value: string | null): UsageRange | undefined {
  if (value === "24h" || value === "7d" || value === "30d") return value;
  return undefined;
}

export async function fetchServerUsage(
  options: UsageRange | { range?: UsageRange; rangeHours?: number } = "24h"
): Promise<ServerUsageResult> {
  const resolved =
    typeof options === "string"
      ? resolveRange(options)
      : resolveRange(options.range ?? options.rangeHours);

  const { range, hours, granularity } = resolved;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const now = new Date();
  const onlineNow = await countConnectedUsers();
  const bucketExpr = bucketSql(granularity);

  const rows = await db
    .select({
      bucket: bucketExpr,
      online: sql<number>`cast(round(avg(${tsServerSnapshots.onlineClients})) as integer)`,
    })
    .from(tsServerSnapshots)
    .where(gte(tsServerSnapshots.recordedAt, since))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  let points: ServerUsagePoint[] = rows.map((row) => ({
    bucket: row.bucket,
    label: formatBucketLabel(row.bucket, granularity),
    online: Number(row.online) || 0,
  }));

  const hasHistory = points.length > 0;

  if (!hasHistory) {
    points = [
      {
        bucket: now.toISOString(),
        label: "Jetzt",
        online: onlineNow,
      },
    ];
  } else {
    const latest = await db
      .select({ recordedAt: tsServerSnapshots.recordedAt })
      .from(tsServerSnapshots)
      .orderBy(desc(tsServerSnapshots.recordedAt))
      .limit(1);

    const lastSample = latest[0]?.recordedAt;
    const staleMs = 15 * 60 * 1000;
    if (!lastSample || now.getTime() - lastSample.getTime() > staleMs) {
      points = [
        ...points,
        {
          bucket: now.toISOString(),
          label: "Jetzt",
          online: onlineNow,
        },
      ];
    }
  }

  const values = points.map((p) => p.online);
  const peakInRange = values.length ? Math.max(...values) : onlineNow;
  const averageInRange = values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : onlineNow;

  return {
    range,
    rangeHours: hours,
    generatedAt: now.toISOString(),
    points,
    stats: {
      onlineNow,
      peakInRange,
      averageInRange,
    },
    hasHistory,
  };
}
