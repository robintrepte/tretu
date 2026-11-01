import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE_PREFIX } from "@/lib/auth/cookie";

/**
 * Optimistic guard for the internal dashboard: without a session cookie, pages redirect to the login and
 * APIs answer 401. The real session and permission checks run in the dashboard layout and API routes.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (getSessionCookie(req, { cookiePrefix: AUTH_COOKIE_PREFIX })) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/internal/dashboard/:path*"],
};
