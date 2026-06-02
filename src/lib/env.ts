/**
 * Public environment variables (NEXT_PUBLIC_*).
 * Safe to import from client components; values are inlined at build time.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export const SITE_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://tretu.de"
);

export const DISCORD_SERVER_ID =
  process.env.NEXT_PUBLIC_DISCORD_SERVER_ID ?? "262342293250506752";

export const TWITCH_CHANNEL =
  process.env.NEXT_PUBLIC_TWITCH_CHANNEL ?? "tretude";

const defaultTsViewerId = 1118784;
const parsedTsViewer = Number(process.env.NEXT_PUBLIC_TSVIEWER_ID);
export const TSVIEWER_ID = Number.isFinite(parsedTsViewer)
  ? parsedTsViewer
  : defaultTsViewerId;
