import { NextResponse } from "next/server";

import { healthReport } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Liveness/readiness for PM2, nginx and the status checks behind /status (no auth, no secrets). */
export async function GET() {
  const report = await healthReport();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
