export type SnapshotBucketGranularity = "hour" | "day";

/**
 * SQL expression that groups `ts_server_snapshots.recorded_at` (timestamptz) into UTC buckets,
 * formatted as `YYYY-MM-DD` (day) or `YYYY-MM-DDTHH:00:00` (hour).
 */
export function snapshotBucketSql(granularity: SnapshotBucketGranularity): string {
  const format = granularity === "day" ? "YYYY-MM-DD" : 'YYYY-MM-DD"T"HH24:00:00';
  return `to_char(recorded_at at time zone 'UTC', '${format}')`;
}
