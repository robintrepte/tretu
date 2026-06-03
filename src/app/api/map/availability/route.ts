import { NextResponse } from "next/server";

import { isMinecraftMapAvailable } from "@/lib/map/availability";

export const dynamic = "force-dynamic";

export async function GET() {
  const available = await isMinecraftMapAvailable();
  return NextResponse.json(
    { available },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    }
  );
}
