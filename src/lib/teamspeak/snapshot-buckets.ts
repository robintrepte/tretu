export type SnapshotBucketGranularity = "hour" | "day";

/**
 * `recorded_at` is unix seconds (Drizzle `integer` mode `"timestamp"`).
 * Dividing by 1000 again maps every 2026 sample onto 1970-01-21 and
 * collapses a whole month into a single chart point.
 */
export function snapshotBucketSql(granularity: SnapshotBucketGranularity): string {
  const format = granularity === "day" ? "%Y-%m-%d" : "%Y-%m-%dT%H:00:00";
  return `strftime('${format}', recorded_at, 'unixepoch')`;
}
