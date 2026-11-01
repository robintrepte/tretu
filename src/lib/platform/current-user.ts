import { getCurrentUser } from "@/lib/auth/session";

/**
 * The signed-in Tretu user for platform pages and `/api/v1/me/**` routes.
 * Platform features need a Tretu-Konto: a user who only signed in with Discord directly
 * (no `tretuSub` yet) is treated as signed out here and asked to use the Tretu-Konto.
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
  const user = await getCurrentUser();
  if (user?.tretuSub) return { sub: user.tretuSub, name: user.name, image: user.image ?? null };
  return devUser();
}

export function loginUrl(callbackPath: string): string {
  return `${PLATFORM_LOGIN_URL}?callbackUrl=${encodeURIComponent(callbackPath)}`;
}
