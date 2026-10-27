/**
 * Server-only env (API routes, DB). Do not import from client components.
 */

export const YOUTUBE_CHANNEL_ID =
  process.env.YOUTUBE_CHANNEL_ID ?? "UCrn4oucvfow7jUNGSeE7ySg";

export const SQLITE_DATABASE_PATH =
  process.env.SQLITE_DATABASE_PATH ?? "local.sqlite";

export const AUTH_SECRET = process.env.AUTH_SECRET ?? "dev-only-change-me";
export const AUTH_TRUST_HOST = (process.env.AUTH_TRUST_HOST ?? "true") === "true";
export const AUTH_DISCORD_CLIENT_ID = process.env.AUTH_DISCORD_CLIENT_ID ?? "";
export const AUTH_DISCORD_CLIENT_SECRET =
  process.env.AUTH_DISCORD_CLIENT_SECRET ?? "";
export const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY ?? "";

/**
 * Game-server dashboard. Hetzner/Cloudflare/CurseForge are normally configured in the dashboard
 * setup (stored encrypted in the DB); these env vars are optional fallbacks.
 */
export const HETZNER_API_TOKEN = process.env.HETZNER_API_TOKEN ?? "";
export const HETZNER_DEFAULT_REGION = process.env.HETZNER_DEFAULT_REGION ?? "fsn1";
export const HETZNER_DEFAULT_SERVER_IMAGE =
  process.env.HETZNER_DEFAULT_SERVER_IMAGE ?? "ubuntu-24.04";
export const HETZNER_SSH_USER = process.env.HETZNER_SSH_USER ?? "root";
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
export const CLOUDFLARE_DOMAIN = process.env.CLOUDFLARE_DOMAIN ?? "";

/** Key for encrypting stored secrets; falls back to AUTH_SECRET. Changing it makes stored secrets unreadable. */
export const DASHBOARD_SECRET_KEY = process.env.DASHBOARD_SECRET_KEY || AUTH_SECRET;

/** Discord user ids that are granted the admin role on login (comma-separated). */
export function getDashboardAdminDiscordIds(): string[] {
  return (process.env.DASHBOARD_ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Run the orchestrator worker inside the Next.js server process (default). Set to "false" when using `npm run worker:orchestrator`. */
export const ORCHESTRATOR_EMBEDDED = (process.env.ORCHESTRATOR_EMBEDDED ?? "true") !== "false";

export const RANKSYSTEM_SQL_DUMP =
  process.env.RANKSYSTEM_SQL_DUMP ?? "./data/ranksystem-full.sql";

export type TsRankConfig = {
  enabled: boolean;
  queryHost: string;
  queryPort: number;
  queryUser: string;
  queryPassword: string;
  virtualServerPort: number;
  pollIntervalSec: number;
  /** Active-time grace: rank time while client_idle_time ≤ this (seconds). */
  idleGraceSec: number;
  /** Comma-separated substrings matched against channel names (e.g. afk). */
  afkChannelMatchers: string;
};

export function getTsRankConfig(): TsRankConfig {
  const queryHost = process.env.TS_QUERY_HOST ?? "";
  const queryUser = process.env.TS_QUERY_USER ?? "";
  const queryPassword = process.env.TS_QUERY_PASSWORD ?? "";
  const virtualServerPort = Number(process.env.TS_VIRTUALSERVER_PORT ?? 9987);
  const queryPort = Number(process.env.TS_QUERY_PORT ?? 10011);
  const pollIntervalSec = Number(process.env.TS_RANK_POLL_INTERVAL_SEC ?? 30);
  const idleGraceSec = Number(process.env.TS_RANK_IDLE_GRACE_SEC ?? 300);
  const afkChannelMatchers = process.env.TS_RANK_AFK_CHANNEL_MATCH ?? "afk";

  const enabled =
    Boolean(queryHost && queryUser && queryPassword) &&
    Number.isFinite(virtualServerPort) &&
    Number.isFinite(queryPort);

  return {
    enabled,
    queryHost,
    queryPort,
    queryUser,
    queryPassword,
    virtualServerPort,
    pollIntervalSec: Number.isFinite(pollIntervalSec) ? pollIntervalSec : 30,
    idleGraceSec: Number.isFinite(idleGraceSec) && idleGraceSec >= 0 ? idleGraceSec : 300,
    afkChannelMatchers,
  };
}
