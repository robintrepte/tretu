import { NextResponse } from "next/server";

import { getLoginProviders } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

/** Header/user-menu state: who is signed in and whether the dashboard link is shown. */
export async function GET() {
  const user = await getCurrentUser();
  const allowed = user ? await hasPermission(user.id, "dashboard:view") : false;
  return NextResponse.json(
    {
      allowed,
      authenticated: Boolean(user),
      user: user ? { name: user.name, image: user.image } : null,
      accountUrl: getLoginProviders().accountUrl,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
