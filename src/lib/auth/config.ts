/**
 * Auth configuration from env (server-only). tretu.de signs people in only with the Tretu-Konto
 * (auth.tretu.de): `TRETU_AUTH_ISSUER`, `TRETU_AUTH_CLIENT_ID` and `TRETU_AUTH_CLIENT_SECRET` are required.
 * Production refuses to start without them (src/instrumentation.ts); development shows "Anmeldung nicht
 * konfiguriert" on /login.
 */
import { adminFromRolesEnabled } from "@/lib/auth/tretu-account";
import { AUTH_SECRET } from "@/lib/env/server";
import { SITE_URL } from "@/lib/env";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Public base URL of this app (OAuth callbacks are built from it). */
export const AUTH_BASE_URL = stripTrailingSlash(
  process.env.BETTER_AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.NODE_ENV === "production" ? SITE_URL : "http://localhost:3020")
);

/** Signs session cookies; `BETTER_AUTH_SECRET` wins, `AUTH_SECRET` keeps working. */
export const AUTH_SIGNING_SECRET = process.env.BETTER_AUTH_SECRET || AUTH_SECRET;

export { AUTH_COOKIE_PREFIX } from "@/lib/auth/cookie";

export type TretuAuthConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  /** Contract §2 callback (`/api/auth/oauth2/callback/tretu`), registered at auth.tretu.de. */
  redirectUri: string;
  /** "Mein Konto" page of the central account. */
  accountUrl: string;
  /** `TRETU_ADMIN_FROM_ROLES` (default on): the Tretu `admin` claim grants the local admin role. */
  adminFromRoles: boolean;
};

export function getTretuAuthConfig(): TretuAuthConfig | null {
  const issuer = stripTrailingSlash(process.env.TRETU_AUTH_ISSUER?.trim() ?? "");
  const clientId = process.env.TRETU_AUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.TRETU_AUTH_CLIENT_SECRET?.trim() ?? "";
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    redirectUri: `${AUTH_BASE_URL}${TRETU_CALLBACK_PATH}`,
    accountUrl: `${issuer}/konto`,
    adminFromRoles: adminFromRolesEnabled(),
  };
}

/** Public path auth.tretu.de redirects back to (Next.js forwards it to Better Auth's `/callback/tretu`). */
export const TRETU_CALLBACK_PATH = "/api/auth/oauth2/callback/tretu";

/** The env vars the Tretu-Konto sign-in needs (all required). */
export const TRETU_AUTH_ENV = ["TRETU_AUTH_ISSUER", "TRETU_AUTH_CLIENT_ID", "TRETU_AUTH_CLIENT_SECRET"] as const;

/** Which of {@link TRETU_AUTH_ENV} are missing or empty (empty list = sign-in configured). */
export function missingTretuAuthEnv(env: Record<string, string | undefined> = process.env): string[] {
  return TRETU_AUTH_ENV.filter((key) => !env[key]?.trim());
}

/**
 * Startup check of the production server: without the Tretu-Konto nobody could sign in, so refuse to start
 * with a clear message instead of serving a site whose login is broken.
 */
export function assertTretuAuthConfigured(env: Record<string, string | undefined> = process.env): void {
  const missing = missingTretuAuthEnv(env);
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} must be set: tretu.de signs people in only with the Tretu-Konto (auth.tretu.de). ` +
        "See DEPLOY.md, \"Tretu-Konto\"."
    );
  }
}
