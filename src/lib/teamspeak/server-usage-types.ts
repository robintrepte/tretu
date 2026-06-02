export type UsageRange = "24h" | "7d" | "30d";

export const USAGE_RANGE_HOURS: Record<UsageRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export const USAGE_RANGE_LABELS: Record<UsageRange, string> = {
  "24h": "24 Stunden",
  "7d": "7 Tage",
  "30d": "30 Tage",
};
