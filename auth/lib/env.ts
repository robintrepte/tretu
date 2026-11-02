import { z } from "zod"

/** Empty strings count as "not set", so `FOO=` in an env file switches a feature off. */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("postgres://postgres@localhost:5432/tretu_auth"),
  /** The OIDC issuer and public base URL of this service, without a trailing slash (https://auth.tretu.de). */
  TRETU_AUTH_ISSUER: z
    .url()
    .default("http://localhost:3021")
    .transform((v) => v.replace(/\/+$/, "")),
  BETTER_AUTH_SECRET: z.string().default("dev-secret-change-me-dev-secret-change-me"),
  /** WebAuthn relying party ID. `tretu.de` lets passkeys work on every Tretu subdomain. */
  AUTH_PASSKEY_RP_ID: optional,
  DISCORD_CLIENT_ID: optional,
  DISCORD_CLIENT_SECRET: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  /** Sign in with Apple: the Services ID and the client secret JWT generated from the Apple key. */
  APPLE_CLIENT_ID: optional,
  APPLE_CLIENT_SECRET: optional,
  APPLE_APP_BUNDLE_IDENTIFIER: optional,
  /** "Mit Steam anmelden" (Steam OpenID 2.0). Off unless "true". */
  STEAM_LOGIN: z.enum(["true", "false"]).default("false"),
  /** Optional Steam Web API key: persona name and avatar for new accounts and in "Verknüpfte Konten". */
  STEAM_WEB_API_KEY: optional,
  /** Where "Verknüpfen" sends people for Minecraft and TeamSpeak (those links are made by the other services). */
  TRETU_MC_LINK_URL: z.url().default("https://mc.tretu.de/verknuepfen"),
  TRETU_TS_LINK_URL: z.url().default("https://tretu.de/einstellungen#teamspeak"),
  /** Tests only: a local stub Steam OpenID endpoint. Refused unless the issuer is plain http on loopback. */
  STEAM_OPENID_ENDPOINT: optional,
  /** Amazon SES v2 region (e.g. eu-central-1); turns on real email. Credentials come from the usual AWS variables. */
  SES_REGION: optional,
  SES_CONFIGURATION_SET: optional,
  EMAIL_FROM: z.string().default("Tretu-Konto <konto@tretu.de>"),
  /** Tests only: emails are written to this folder as JSON instead of being sent. */
  MAIL_OUTBOX_DIR: optional,
  /** Cloudflare Turnstile on registration (both keys required). */
  TURNSTILE_SITE_KEY: optional,
  TURNSTILE_SECRET_KEY: optional,
  /** Registered OIDC clients (see README), synced into the database by `npm run clients:sync`. */
  TRETU_OAUTH_CLIENTS_JSON: optional,
  /** Every app's signing secret (contract §3), used to verify admin API requests. */
  TRETU_APPS_JSON: optional,
  /** Platform event delivery (contract §4); off unless both are set. */
  TRETU_PLATFORM_URL: optional,
  TRETU_APP_SECRET: optional,
  TRETU_LEGAL_URL: z
    .url()
    .default("https://tretu.de")
    .transform((v) => v.replace(/\/+$/, "")),
  /** Only for automated tests that sign up many accounts from one IP. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  /** Set to "false" to stop `npm start` from syncing TRETU_OAUTH_CLIENTS_JSON at boot. */
  CLIENTS_SYNC_ON_START: z.enum(["true", "false"]).default("true"),
})

export type Env = z.infer<typeof schema>

export const env: Env = schema.parse(process.env)

export const issuer = env.TRETU_AUTH_ISSUER
export const isHttps = issuer.startsWith("https://")

export const socialProviders = {
  discord: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  apple: Boolean(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET),
}
export type SocialProvider = keyof typeof socialProviders
export const enabledSocialProviders = (Object.keys(socialProviders) as SocialProvider[]).filter((p) => socialProviders[p])

/** Steam's OpenID 2.0 provider endpoint (Steam has no OAuth 2). */
export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login"
export const steamEnabled = env.STEAM_LOGIN === "true"

/** Test-only overrides (stub providers) are honoured only for a plain-http loopback issuer, never in production. */
export function allowsTestOverrides(issuerUrl: string = issuer): boolean {
  const url = new URL(issuerUrl)
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
}

/** The OpenID endpoint for Steam: Steam's own, or the stub of the tests (refused for any real deployment). */
export function resolveSteamEndpoint(override: string | undefined, issuerUrl: string = issuer): string {
  if (!override) return STEAM_OPENID_ENDPOINT
  if (!allowsTestOverrides(issuerUrl)) throw new Error("STEAM_OPENID_ENDPOINT is for tests only and refused with this issuer")
  return override
}

export const mailEnabled = Boolean(env.SES_REGION || env.MAIL_OUTBOX_DIR)
export const turnstileEnabled = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)
export const platformEnabled = Boolean(env.TRETU_PLATFORM_URL && env.TRETU_APP_SECRET)

/** `tretu.de` for the production issuer and its subdomains, else the issuer's own host (e.g. localhost in dev). */
export function rpIdFor(issuerUrl: string, override?: string): string {
  if (override) return override
  const host = new URL(issuerUrl).hostname
  return host === "tretu.de" || host.endsWith(".tretu.de") ? "tretu.de" : host
}

export function passkeyRpId(): string {
  return rpIdFor(issuer, env.AUTH_PASSKEY_RP_ID)
}

/** Fail fast on an insecure production configuration. */
export function assertProductionEnv() {
  if (env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return
  const problems: string[] = []
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is required")
  if (!process.env.TRETU_AUTH_ISSUER) problems.push("TRETU_AUTH_ISSUER is required")
  if (!process.env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) problems.push("BETTER_AUTH_SECRET must be at least 32 characters")
  if (!isHttps && !allowsTestOverrides()) problems.push("TRETU_AUTH_ISSUER must use https (plain http only on localhost)")
  if (env.STEAM_OPENID_ENDPOINT && !allowsTestOverrides()) problems.push("STEAM_OPENID_ENDPOINT is for tests only: remove it")
  if (problems.length) throw new Error(`Invalid environment:\n- ${problems.join("\n- ")}`)
}
