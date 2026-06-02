import { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/respond";
import { fetchLeaderboard } from "@/lib/teamspeak/leaderboard";
import { parseLeaderboardPeriod } from "@/lib/teamspeak/leaderboard-period";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const period = parseLeaderboardPeriod(searchParams.get("period"));

  const limitRaw = Number(searchParams.get("limit") ?? 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

  const search = searchParams.get("search") ?? undefined;

  try {
    const data = await fetchLeaderboard({ period, limit, search });
    return ok(data, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Ranking unavailable", 500);
  }
}
