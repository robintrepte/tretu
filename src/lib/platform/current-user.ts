/**
 * The signed-in Tretu user for platform pages and `/api/v1/me/**` routes.
 *
 * TODO(integration): after merging the Better Auth branch, replace the body of `getPlatformUser`
 * with:
 *
 *   import { getCurrentUser } from "@/lib/auth/session";
 *   const user = await getCurrentUser();
 *   if (user?.tretuSub) return { sub: user.tretuSub, name: user.name, image: user.image ?? null };
 *   return devUser();   // keep the dev impersonation below for local testing
 *
 * and point PLATFORM_LOGIN_URL at the Tretu-Konto sign-in route.
 */
export type PlatformUser = { sub: string; name: string; image: string | null };

/** Where the "Mit Tretu-Konto anmelden" buttons send people (`callbackUrl` is appended). */
export const PLATFORM_LOGIN_URL = "/login";

/** Development only: impersonate `TRETU_PLATFORM_DEV_SUB` (never in production builds). */
function devUser(): PlatformUser | null {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return null;
  const sub = process.env.TRETU_PLATFORM_DEV_SUB?.trim();
  if (!sub) return null;
  return { sub, name: process.env.TRETU_PLATFORM_DEV_NAME?.trim() || "Dev", image: null };
}

export async function getPlatformUser(): Promise<PlatformUser | null> {
  return devUser();
}

export function loginUrl(callbackPath: string): string {
  return `${PLATFORM_LOGIN_URL}?callbackUrl=${encodeURIComponent(callbackPath)}`;
}
