import { TS_RANK_TIMEZONE } from "./period";

export type UsageGranularity = "hour" | "day";

type BerlinParts = { year: string; month: string; day: string; hour: string };

function berlinParts(date: Date): BerlinParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TS_RANK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour") === "24" ? "00" : read("hour");
  return { year: read("year"), month: read("month"), day: read("day"), hour };
}

/** Calendar bucket in Europe/Berlin, not the server timezone. */
export function berlinBucketKey(date: Date, granularity: UsageGranularity): string {
  const { year, month, day, hour } = berlinParts(date);
  if (granularity === "day") return `${year}-${month}-${day}`;
  return `${year}-${month}-${day}T${hour}:00:00`;
}

export function formatBerlinBucketLabel(bucket: string, granularity: UsageGranularity): string {
  const [datePart, timePart = "00:00:00"] = bucket.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (granularity === "day") {
    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.`;
  }

  const hour = Number(timePart.slice(0, 2));
  const wallClock = new Date(Date.UTC(year, month - 1, day, hour, 0));
  return wallClock.toLocaleString("de-DE", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Every Berlin hour or day from `since` through `now`, in order. */
export function berlinBucketKeys(since: Date, now: Date, granularity: UsageGranularity): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const end = now.getTime();
  for (let time = since.getTime(); time <= end; time += 60 * 60 * 1000) {
    const key = berlinBucketKey(new Date(time), granularity);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  const nowKey = berlinBucketKey(now, granularity);
  if (!seen.has(nowKey)) keys.push(nowKey);
  return keys;
}

export type UtcHourSample = { bucket: string; total: number; samples: number };

export function buildUsageTimeline(options: {
  since: Date;
  now: Date;
  granularity: UsageGranularity;
  samples: UtcHourSample[];
}): {
  points: { bucket: string; label: string; online: number }[];
  measured: number[];
} {
  const totals = new Map<string, { total: number; samples: number }>();
  for (const sample of options.samples) {
    const utc = sample.bucket.endsWith("Z") ? sample.bucket : `${sample.bucket}Z`;
    const instant = new Date(utc);
    if (Number.isNaN(instant.getTime())) continue;
    const key = berlinBucketKey(instant, options.granularity);
    const current = totals.get(key) ?? { total: 0, samples: 0 };
    current.total += sample.total;
    current.samples += sample.samples;
    totals.set(key, current);
  }

  const measured: number[] = [];
  const points = berlinBucketKeys(options.since, options.now, options.granularity).map((bucket) => {
    const current = totals.get(bucket);
    const online =
      current && current.samples > 0 ? Math.round(current.total / current.samples) : 0;
    if (current && current.samples > 0) measured.push(online);
    return {
      bucket,
      label: formatBerlinBucketLabel(bucket, options.granularity),
      online,
    };
  });

  return { points, measured };
}
