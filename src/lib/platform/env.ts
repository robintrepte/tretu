/**
 * Platform configuration from env. Everything is read lazily (per call) so tests can change env
 * and `next build` never needs any of it. Every integration is OFF unless its env vars are set.
 */
import { z } from "zod";

import { log } from "@/lib/observability/logger";

export const APP_IDS = ["tretu-web", "auth", "saga", "play", "hollowmere", "mc-dashboard"] as const;
export type KnownAppId = (typeof APP_IDS)[number];

/** Sender id the platform uses for webhooks (contract §3/§4). */
export const PLATFORM_SENDER_ID = "platform";

const appConfigSchema = z.object({
  secret: z.string().min(1),
  webhook: z.url({ protocol: /^https?$/ }).optional(),
});
const appsSchema = z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), appConfigSchema);

export type AppConfig = z.infer<typeof appConfigSchema>;
export type AppsConfig = Record<string, AppConfig>;

let appsCache: { raw: string; value: AppsConfig } | null = null;

/** `TRETU_APPS_JSON` parsed and validated; `{}` when unset or invalid (logged once). */
export function getAppsConfig(): AppsConfig {
  const raw = process.env.TRETU_APPS_JSON ?? "";
  if (appsCache && appsCache.raw === raw) return appsCache.value;
  let value: AppsConfig = {};
  if (raw.trim()) {
    try {
      const parsed = appsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
      else log("error", "platform.config.invalid_apps_json", { issues: parsed.error.issues.length });
    } catch {
      log("error", "platform.config.invalid_apps_json", { reason: "not json" });
    }
  }
  appsCache = { raw, value };
  return value;
}

export function getAppConfig(app: string): AppConfig | null {
  const apps = getAppsConfig();
  return Object.prototype.hasOwnProperty.call(apps, app) ? apps[app] : null;
}

/** Apps that receive webhooks (have a `webhook` URL). */
export function getWebhookSubscribers(): { app: string; url: string; secret: string }[] {
  return Object.entries(getAppsConfig())
    .filter(([, cfg]) => Boolean(cfg.webhook))
    .map(([app, cfg]) => ({ app, url: cfg.webhook as string, secret: cfg.secret }));
}

/** Public base URL of tretu.de (profile links). */
export function getPlatformBaseUrl(): string {
  const raw = process.env.TRETU_PLATFORM_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://tretu.de";
  return raw.replace(/\/+$/, "");
}

/** auth.tretu.de issuer (no trailing slash) or null when the integration is off. */
export function getAuthIssuer(): string | null {
  const raw = process.env.TRETU_AUTH_ISSUER?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

/** The app id tretu.de signs its own outgoing calls with (auth admin API). */
export const SELF_APP_ID = "tretu-web";

/** Integer env with default and bounds. */
export function intEnv(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function parseJsonMap(name: string): Record<string, string> {
  const raw = process.env[name]?.trim();
  if (!raw) return {};
  try {
    const parsed = z.record(z.string(), z.union([z.string(), z.number()])).safeParse(JSON.parse(raw));
    if (!parsed.success) {
      log("error", "platform.config.invalid_json_map", { name });
      return {};
    }
    return Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, String(v)]));
  } catch {
    log("error", "platform.config.invalid_json_map", { name });
    return {};
  }
}

export type DiscordSyncConfig = { token: string; guildId: string; roles: Record<string, string> };

/** Discord badge-role sync; null unless token, guild and a non-empty mapping are set. */
export function getDiscordSyncConfig(): DiscordSyncConfig | null {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const roles = parseJsonMap("TRETU_BADGE_DISCORD_ROLES_JSON");
  if (!token || !guildId || Object.keys(roles).length === 0) return null;
  return { token, guildId, roles };
}

/** Badge → TeamSpeak server group id (empty = TS badge sync off). */
export function getTsBadgeGroups(): Record<string, number> {
  const map = parseJsonMap("TRETU_BADGE_TS_GROUPS_JSON");
  const out: Record<string, number> = {};
  for (const [badge, value] of Object.entries(map)) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) out[badge] = n;
  }
  return out;
}

export type WebPushConfig = { publicKey: string; privateKey: string; subject: string };

export function getWebPushConfig(): WebPushConfig | null {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}
