/**
 * Auth configuration from env (server-only). Every Tretu-Konto integration is off unless
 * `TRETU_AUTH_ISSUER`, `TRETU_AUTH_CLIENT_ID` and `TRETU_AUTH_CLIENT_SECRET` are set.
 */
import { adminFromRolesEnabled } from "@/lib/auth/tretu-account";
import { AUTH_DISCORD_CLIENT_ID, AUTH_DISCORD_CLIENT_SECRET, AUTH_SECRET } from "@/lib/env/server";
import { SITE_URL } from "@/lib/env";

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

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

export type LoginProviders = {
  tretu: boolean;
  discord: boolean;
  accountUrl: string | null;
};

/**
 * Which sign-in buttons exist. Without the Tretu provider, Discord is the only (and primary) login.
 * With it, Discord is a fallback unless `TRETU_DISCORD_FALLBACK=false`.
 */
export function getLoginProviders(): LoginProviders {
  const tretu = getTretuAuthConfig();
  const discordConfigured = Boolean(AUTH_DISCORD_CLIENT_ID && AUTH_DISCORD_CLIENT_SECRET);
  const discord = tretu ? discordConfigured && flag(process.env.TRETU_DISCORD_FALLBACK, true) : true;
  return { tretu: Boolean(tretu), discord, accountUrl: tretu?.accountUrl ?? null };
}
