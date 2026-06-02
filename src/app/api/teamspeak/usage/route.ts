import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/respond";
import { fetchServerUsage, parseUsageRangeParam } from "@/lib/teamspeak/server-usage";

export async function GET(request: NextRequest) {
  try {
    const range = parseUsageRangeParam(request.nextUrl.searchParams.get("range"));
    const hoursParam = request.nextUrl.searchParams.get("hours");
    const hours = hoursParam ? Number(hoursParam) : undefined;

    const data = range
      ? await fetchServerUsage(range)
      : await fetchServerUsage(
          Number.isFinite(hours) && hours! > 0 ? { rangeHours: hours! } : "24h"
        );
    return ok(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return fail(message, 500);
  }
}
