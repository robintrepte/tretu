import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { AUTH_SECRET } from "@/lib/env/server";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requiresDashboard =
    pathname.startsWith("/dashboard") || pathname.startsWith("/api/internal/dashboard");

  if (!requiresDashboard) {
    return NextResponse.next();
  }

  /** Muss exakt dasselbe Secret wie in `authOptions` sein (inkl. Fallback aus `@/lib/env/server`). */
  const token = await getToken({ req, secret: AUTH_SECRET });
  const userId = typeof token?.userId === "string" ? token.userId : null;

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/internal/dashboard/:path*"],
};
