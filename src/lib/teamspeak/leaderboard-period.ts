export type LeaderboardPeriod = "week" | "month" | "year" | "all";

export const LEADERBOARD_PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  week: "Woche",
  month: "Monat",
  year: "Jahr",
  all: "Gesamt",
};

export function parseLeaderboardPeriod(value: string | null): LeaderboardPeriod {
  if (value === "week" || value === "month" || value === "year" || value === "all") {
    return value;
  }
  return "month";
}
