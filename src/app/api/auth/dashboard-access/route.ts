import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserId();
  const allowed = userId ? hasPermission(userId, "dashboard:view") : false;
  return NextResponse.json(
    { allowed },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
