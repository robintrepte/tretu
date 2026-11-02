import { NextResponse } from "next/server";

import { getStatusOverview } from "@/lib/status/read";

export const dynamic = "force-dynamic";

/**
 * Public status of every Tretu service (the data behind /status), read from the database only.
 * Cached 30 s here and for clients; no auth, nothing personal in it.
 */
export async function GET() {
  const overview = await getStatusOverview();
  return NextResponse.json(overview, {
    status: overview.available ? 200 : 503,
    headers: {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=30",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
