#!/usr/bin/env node
/**
 * Generates ONE consistent set of secrets and the filled env files for the whole Tretu ecosystem
 * (docs/ecosystem/CONTRACT.md): every app's TRETU_APP_SECRET and the matching TRETU_APPS_JSON (with
 * webhooks), every OIDC client secret and the matching TRETU_OAUTH_CLIENTS_JSON (redirect + post-logout
 * URIs), Better Auth / session secrets, VAPID keys, Nakama keys and one Postgres password per app role.
 *
 *   node deploy/scripts/generate-secrets.mjs --out /root/tretu-secrets
 *   node deploy/scripts/generate-secrets.mjs --out /root/tretu-secrets --import saga=/srv/saga/.env --import play=/srv/play/.env
 *   node deploy/scripts/generate-secrets.mjs --templates deploy/env      # the committed *.example files
 *
 * - Files are written with mode 600 into a directory with mode 700. Secrets are never printed.
 * - Idempotent: `<out>/tretu-secrets.json` keeps the generated values; running again rewrites the same files
 *   and only fills in what is missing. `--fresh` starts over (new secrets everywhere: everyone is signed out).
 * - `--import <app>=<env file>` takes the values of an app's current env file (existing secrets such as a
 *   running app's session secret, API keys, OAuth credentials); keys the template does not know are kept at
 *   the end of the file. Imported secrets win over generated ones and flow into the shared JSON configs.
 * - Values from outside (Discord/Google/Apple OAuth apps, SES, OpenAI, …) stay empty unless imported:
 *   fill them in afterwards. Every integration stays off while its values are empty.
 */
import { createECDH, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATE_FILE = "tretu-secrets.json";

/** Contract §0: apps, hosts, ports, databases. */
export const APPS = {
  "tretu-web": { host: "", dir: "/srv/tretu", db: "tretu_web", port: 3020 },
  auth: { host: "auth.", dir: "/srv/tretu/auth", db: "tretu_auth", port: 3021 },
  saga: { host: "saga.", dir: "/srv/saga", db: "saga", port: 3038 },
  play: { host: "play.", dir: "/srv/play", db: "play", port: 3030 },
  hollowmere: { host: "hollowmere.", dir: "/srv/hollowmere", db: "nakama", port: 7350 },
  "mc-dashboard": { host: "mc.", dir: "/srv/tretu-minecraft", db: "mc_dashboard", port: 8130 },
};

/** Postgres roles (one per database) plus the read-only role auth uses for the legacy import. */
export const DB_ROLES = ["tretu_web", "tretu_auth", "saga", "play", "mc_dashboard", "nakama", "tretu_legacy_reader"];

/** Apps that sign platform calls (contract §1) and the ones that receive webhooks (convention path). */
export const SIGNING_APPS = ["tretu-web", "auth", "saga", "play", "hollowmere", "mc-dashboard"];
const WEBHOOK_APPS = ["saga", "play", "mc-dashboard"];
const CONFIDENTIAL_CLIENTS = ["tretu-web", "saga", "play", "mc-dashboard"];

const hex = (bytes) => randomBytes(bytes).toString("hex");
const b64url = (bytes) => randomBytes(bytes).toString("base64url");

/** VAPID key pair (P-256) in the web-push format: uncompressed public point and raw private key, base64url. */
export function vapidKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
}

/** Every generated value, by logical name. Existing values (state file, imports) are kept. */
export function completeSecrets(existing = {}) {
  const s = { ...existing };
  const put = (name, make) => {
    if (typeof s[name] !== "string" || !s[name]) s[name] = make();
  };
  for (const app of SIGNING_APPS) put(`app.${app}`, () => hex(32));
  for (const client of CONFIDENTIAL_CLIENTS) put(`oauth.${client}`, () => b64url(32));
  for (const role of DB_ROLES) put(`db.${role}`, () => hex(24));
  put("tretu-web.authSecret", () => b64url(48));
  put("auth.betterAuthSecret", () => b64url(48));
  put("saga.authSecret", () => b64url(48));
  put("play.betterAuthSecret", () => b64url(48));
  put("nakama.sessionKey", () => hex(24));
  put("nakama.refreshKey", () => hex(24));
  put("nakama.httpKey", () => hex(24));
  put("nakama.consolePassword", () => b64url(18));
  if (!s["tretu-web.vapidPublic"] || !s["tretu-web.vapidPrivate"]) {
    const k = vapidKeys();
    s["tretu-web.vapidPublic"] = k.publicKey;
    s["tretu-web.vapidPrivate"] = k.privateKey;
  }
  if (!s["play.vapidPublic"] || !s["play.vapidPrivate"]) {
    const k = vapidKeys();
    s["play.vapidPublic"] = k.publicKey;
    s["play.vapidPrivate"] = k.privateKey;
  }
  return s;
}

export function urls(domain) {
  const base = (app) => `https://${APPS[app].host}${domain}`;
  return {
    web: base("tretu-web"),
    auth: base("auth"),
    saga: base("saga"),
    play: base("play"),
    hollowmere: base("hollowmere"),
    mc: base("mc-dashboard"),
    mcp: `https://mcp.hollowmere.${domain}`,
  };
}

export function appsJson(domain, s) {
  const u = urls(domain);
  const webhook = { saga: `${u.saga}/api/tretu/webhook`, play: `${u.play}/api/tretu/webhook`, "mc-dashboard": `${u.mc}/api/tretu/webhook` };
  return Object.fromEntries(
    SIGNING_APPS.map((app) => [app, WEBHOOK_APPS.includes(app) ? { secret: s[`app.${app}`], webhook: webhook[app] } : { secret: s[`app.${app}`] }])
  );
}

/** Health endpoints polled for tretu.de/status (contract §0; same ids and labels as src/lib/status/targets.ts). */
export function statusTargets(domain) {
  const u = urls(domain);
  return [
    { id: "tretu-web", url: `${u.web}/api/health` },
    { id: "auth", url: `${u.auth}/api/health` },
    { id: "saga", url: `${u.saga}/api/health` },
    { id: "play", url: `${u.play}/api/health` },
    { id: "hollowmere", url: `${u.hollowmere}/api/health` },
    { id: "mc-dashboard", url: `${u.mc}/api/health` },
  ];
}

export function oauthClientsJson(domain, s) {
  const u = urls(domain);
  return {
    "tretu-web": {
      type: "confidential",
      secret: s["oauth.tretu-web"],
      name: "tretu.de",
      redirectUris: [`${u.web}/api/auth/oauth2/callback/tretu`],
      postLogoutRedirectUris: [`${u.web}/`],
    },
    saga: {
      type: "confidential",
      secret: s["oauth.saga"],
      name: "Saga",
      redirectUris: [`${u.saga}/api/auth/oauth2/callback/tretu`],
      postLogoutRedirectUris: [`${u.saga}/`],
    },
    play: {
      type: "confidential",
      secret: s["oauth.play"],
      name: "Play",
      redirectUris: [`${u.play}/api/auth/oauth2/callback/tretu`],
      postLogoutRedirectUris: [`${u.play}/`],
    },
    "mc-dashboard": {
      type: "confidential",
      secret: s["oauth.mc-dashboard"],
      name: "Minecraft",
      redirectUris: [`${u.mc}/auth/callback`],
      postLogoutRedirectUris: [`${u.mc}/`],
    },
    hollowmere: {
      type: "public",
      name: "Hollowmere",
      redirectUris: [`${u.hollowmere}/auth/callback`, "http://127.0.0.1/callback"],
      postLogoutRedirectUris: [`${u.hollowmere}/`],
    },
  };
}

const dbUrl = (role, db, password, { scheme = "postgres", host = "localhost", query = "" } = {}) =>
  `${scheme}://${role}:${password}@${host}:5432/${db}${query}`;

/**
 * Env file specs. Each entry: [key, value, comment?] or a "# heading" string. `secret: true` marks
 * generated secrets (rendered as <generated> in templates). Keys listed in `external` are filled by hand.
 */
function specs(domain, s) {
  const u = urls(domain);
  const G = (name) => ({ secret: name });
  const X = (comment = "") => ({ external: true, comment });
  const json = (value) => ({ json: value });
  return {
    "tretu-web": {
      file: "tretu-web/.env.local",
      target: `${APPS["tretu-web"].dir}/.env.local`,
      doc: "DEPLOY.md, docs/ecosystem/PLATFORM.md",
      lines: [
        "# Public (inlined at build time: rebuild after changes)",
        ["NEXT_PUBLIC_SITE_URL", u.web],
        ["NEXT_PUBLIC_DISCORD_SERVER_ID", "262342293250506752"],
        ["NEXT_PUBLIC_TWITCH_CHANNEL", "tretude"],
        ["NEXT_PUBLIC_TSVIEWER_ID", "1118784"],
        "# Server",
        ["YOUTUBE_CHANNEL_ID", "UCrn4oucvfow7jUNGSeE7ySg"],
        ["DATABASE_URL", { db: ["tretu_web", "tretu_web"] }],
        ["AUTH_SECRET", G("tretu-web.authSecret"), "signs sessions and encrypts dashboard secrets: import the existing one on an upgrade"],
        ["BETTER_AUTH_URL", u.web],
        ["AUTH_DISCORD_CLIENT_ID", X("Discord OAuth app, redirect <BETTER_AUTH_URL>/api/auth/callback/discord")],
        ["AUTH_DISCORD_CLIENT_SECRET", X()],
        ["DASHBOARD_ADMIN_DISCORD_IDS", X("comma-separated Discord user ids")],
        ["HETZNER_DEFAULT_SERVER_IMAGE", "ubuntu-24.04"],
        "# Tretu-Konto login (contract §2)",
        ["TRETU_AUTH_ISSUER", u.auth],
        ["TRETU_AUTH_CLIENT_ID", "tretu-web"],
        ["TRETU_AUTH_CLIENT_SECRET", G("oauth.tretu-web")],
        ["TRETU_DISCORD_FALLBACK", "true"],
        ["TRETU_ADMIN_FROM_ROLES", "true"],
        "# Platform (contract §3–§5)",
        ["TRETU_APPS_JSON", json(appsJson(domain, s))],
        ["TRETU_APP_ID", "tretu-web"],
        ["TRETU_APP_SECRET", G("app.tretu-web")],
        ["TRETU_PLATFORM_URL", u.web],
        ["WEB_PUSH_PUBLIC_KEY", G("tretu-web.vapidPublic")],
        ["WEB_PUSH_PRIVATE_KEY", G("tretu-web.vapidPrivate")],
        ["WEB_PUSH_SUBJECT", "mailto:business@tretu.de"],
        "# Status page tretu.de/status (checks run in tretu-platform-worker, see DEPLOY.md)",
        ["TRETU_STATUS_TARGETS_JSON", json(statusTargets(domain))],
        ["TRETU_STATUS_MINECRAFT", `mc.${domain}:25565`],
        ["TRETU_STATUS_TEAMSPEAK", X("optional host:port for a TCP check when TS_QUERY_* is not set (ServerQuery is used otherwise)")],
        ["TRETU_STATUS_CERT_HOSTS", `map.${domain},mcp.hollowmere.${domain}`, "certificates to watch besides the hosts above"],
        ["TRETU_STATUS_DISCORD_WEBHOOK_URL", X("optional: Discord webhook for outage and recovery messages")],
        ["TRETU_STATUS_NOTICE", X("optional: maintenance note shown on /status")],
        "# Badge → Discord role / TeamSpeak group sync (off while the mappings are empty)",
        ["DISCORD_BOT_TOKEN", X("bot with Manage Roles, role above the badge roles")],
        ["DISCORD_GUILD_ID", "262342293250506752"],
        ["TRETU_BADGE_DISCORD_ROLES_JSON", X('{"wins-10":"<role id>",…}')],
        ["TRETU_BADGE_TS_GROUPS_JSON", X('{"wins-10":31,…}')],
        "# TeamSpeak ServerQuery (ranking worker, TeamSpeak link, badge groups)",
        ["TS_QUERY_HOST", "127.0.0.1"],
        ["TS_QUERY_PORT", "10011"],
        ["TS_QUERY_USER", X()],
        ["TS_QUERY_PASSWORD", X()],
        ["TS_VIRTUALSERVER_PORT", "9987"],
      ],
    },
    auth: {
      file: "tretu-auth/.env",
      target: `${APPS.auth.dir}/.env`,
      doc: "auth/DEPLOY.md",
      lines: [
        "# Core",
        ["DATABASE_URL", { db: ["tretu_auth", "tretu_auth"] }],
        ["TRETU_AUTH_ISSUER", u.auth],
        ["BETTER_AUTH_SECRET", G("auth.betterAuthSecret"), "also encrypts the ID token signing keys: never rotate casually"],
        ["AUTH_PASSKEY_RP_ID", domain],
        "# OIDC clients (contract §2), synced at boot",
        ["TRETU_OAUTH_CLIENTS_JSON", json(oauthClientsJson(domain, s))],
        ["TRETU_CORS_ORIGINS", X("optional, comma-separated; default: the https origins of the public clients")],
        "# Sign-in providers (each only active when both values are set)",
        ["DISCORD_CLIENT_ID", X(`redirect ${u.auth}/api/auth/callback/discord`)],
        ["DISCORD_CLIENT_SECRET", X()],
        ["GOOGLE_CLIENT_ID", X(`redirect ${u.auth}/api/auth/callback/google`)],
        ["GOOGLE_CLIENT_SECRET", X()],
        ["APPLE_CLIENT_ID", X()],
        ["APPLE_CLIENT_SECRET", X()],
        ["APPLE_APP_BUNDLE_IDENTIFIER", X()],
        ["STEAM_LOGIN", "true"],
        ["STEAM_WEB_API_KEY", X("optional: persona name and avatar")],
        ["TRETU_MC_LINK_URL", `${u.mc}/verknuepfen`],
        ["TRETU_TS_LINK_URL", `${u.web}/einstellungen#teamspeak`],
        "# Email (Amazon SES v2)",
        ["SES_REGION", X("e.g. eu-central-1")],
        ["SES_CONFIGURATION_SET", X()],
        ["EMAIL_FROM", `Tretu-Konto <konto@${domain}>`],
        ["AWS_ACCESS_KEY_ID", X("IAM user with ses:SendEmail (or an instance role)")],
        ["AWS_SECRET_ACCESS_KEY", X()],
        "# Cloudflare Turnstile on registration (optional)",
        ["TURNSTILE_SITE_KEY", X()],
        ["TURNSTILE_SECRET_KEY", X()],
        "# Ecosystem (contract §1, §3, §4)",
        ["TRETU_APPS_JSON", json(appsJson(domain, s))],
        ["TRETU_PLATFORM_URL", u.web],
        ["TRETU_APP_SECRET", G("app.auth")],
        ["TRETU_LEGAL_URL", u.web],
        "# Legacy import (read-only role, see deploy/scripts/create-databases.sh)",
        ["LEGACY_SAGA_DATABASE_URL", { db: ["tretu_legacy_reader", "saga"] }],
        ["LEGACY_PLAY_DATABASE_URL", { db: ["tretu_legacy_reader", "play"] }],
        ["LEGACY_TRETU_DATABASE_URL", { db: ["tretu_legacy_reader", "tretu_web"] }],
        ["LEGACY_NAKAMA_DATABASE_URL", { db: ["tretu_legacy_reader", "nakama"] }],
      ],
    },
    saga: {
      file: "saga/.env",
      target: `${APPS.saga.dir}/.env`,
      doc: "adventure.ai DEPLOY.md",
      lines: [
        ["DATABASE_URL", { db: ["saga", "saga"], scheme: "postgresql", query: "?schema=public" }],
        ["AUTH_SECRET", G("saga.authSecret"), "import the existing one: a new value signs everyone out"],
        ["AUTH_URL", u.saga],
        "# AI",
        ["AI_PROVIDER", "openai"],
        ["OPENAI_API_KEY", X()],
        ["REPLICATE_API_TOKEN", X()],
        ["ELEVENLABS_API_KEY", X()],
        "# Optional sign-in providers and Discord bot",
        ["DISCORD_CLIENT_ID", X()],
        ["DISCORD_CLIENT_SECRET", X()],
        ["DISCORD_BOT_TOKEN", X()],
        ["GOOGLE_CLIENT_ID", X()],
        ["GOOGLE_CLIENT_SECRET", X()],
        "# Email (Amazon SES)",
        ["SES_REGION", X()],
        ["AWS_ACCESS_KEY_ID", X()],
        ["AWS_SECRET_ACCESS_KEY", X()],
        ["MAIL_FROM", `Saga <noreply@${domain}>`],
        ["SES_CONFIGURATION_SET", X()],
        "# Tretu ecosystem",
        ["TRETU_AUTH_ISSUER", u.auth],
        ["TRETU_AUTH_CLIENT_ID", "saga"],
        ["TRETU_AUTH_CLIENT_SECRET", G("oauth.saga")],
        ["TRETU_LOCAL_LOGIN", "true"],
        ["TRETU_SKIP_INVITE_FOR_TRETU", "true"],
        ["TRETU_PLATFORM_URL", u.web],
        ["TRETU_APP_ID", "saga"],
        ["TRETU_APP_SECRET", G("app.saga")],
        ["TRETU_LEGAL_URL", u.web],
        "# Payments (prepared, off)",
        ["STRIPE_SECRET_KEY", X()],
        ["STRIPE_WEBHOOK_SECRET", X()],
        "# Storage and logs",
        ["STORAGE_DIR", "/var/lib/saga/storage"],
        ["LOG_LEVEL", "info"],
      ],
    },
    play: {
      file: "play/.env",
      target: `${APPS.play.dir}/.env`,
      doc: "play DEPLOY.md",
      lines: [
        ["APP_URL", u.play],
        ["DATABASE_URL", { db: ["play", "play"] }],
        ["BETTER_AUTH_SECRET", G("play.betterAuthSecret"), "import the existing one: a new value signs everyone out"],
        ["PORT", String(APPS.play.port)],
        ["TRUST_PROXY", "true"],
        "# Optional social sign-in",
        ["GOOGLE_CLIENT_ID", X()],
        ["GOOGLE_CLIENT_SECRET", X()],
        ["DISCORD_CLIENT_ID", X()],
        ["DISCORD_CLIENT_SECRET", X()],
        "# Email (Amazon SES)",
        ["SES_REGION", X()],
        ["EMAIL_FROM", `Tretu Play <play@${domain}>`],
        ["SES_CONFIGURATION_SET", X()],
        ["AWS_ACCESS_KEY_ID", X()],
        ["AWS_SECRET_ACCESS_KEY", X()],
        "# Web Push (import the existing keys: new keys invalidate every subscription)",
        ["VAPID_PUBLIC_KEY", G("play.vapidPublic")],
        ["VAPID_PRIVATE_KEY", G("play.vapidPrivate")],
        ["VAPID_SUBJECT", `mailto:play@${domain}`],
        ["TMDB_API_KEY", X()],
        "# Tretu ecosystem",
        ["TRETU_AUTH_ISSUER", u.auth],
        ["TRETU_AUTH_CLIENT_ID", "play"],
        ["TRETU_AUTH_CLIENT_SECRET", G("oauth.play")],
        ["TRETU_LOCAL_LOGIN", "true"],
        ["TRETU_PLATFORM_URL", u.web],
        ["TRETU_APP_ID", "play"],
        ["TRETU_APP_SECRET", G("app.play")],
        ["TRETU_LEGAL_URL", u.web],
      ],
    },
    hollowmere: {
      file: "hollowmere/server.env",
      target: `${APPS.hollowmere.dir}/server/.env`,
      doc: "hollowmere HOSTING.md",
      lines: [
        ["NAKAMA_BIN", "/opt/nakama/nakama"],
        ["NAKAMA_HTTP_KEY", G("nakama.httpKey"), "same as runtime.http_key in server/nakama/local.yml"],
        ["MCP_PORT", "8787"],
        ["MCP_PUBLIC_URL", u.mcp],
      ],
    },
    "mc-dashboard": {
      file: "mc-dashboard/.env",
      target: `${APPS["mc-dashboard"].dir}/dashboard/.env`,
      doc: "tretu-minecraft README.md (dashboard)",
      lines: [
        ["DATABASE_URL", { db: ["mc_dashboard", "mc_dashboard"], host: "127.0.0.1" }],
        ["PUBLIC_URL", u.mc],
        "# Tretu-Konto (confidential client mc-dashboard)",
        ["TRETU_AUTH_ISSUER", u.auth],
        ["TRETU_AUTH_CLIENT_ID", "mc-dashboard"],
        ["TRETU_AUTH_CLIENT_SECRET", G("oauth.mc-dashboard")],
        ["TRETU_CODE_LOGIN", "true"],
        "# Signed server-to-server requests",
        ["TRETU_APP_ID", "mc-dashboard"],
        ["TRETU_APP_SECRET", G("app.mc-dashboard")],
        ["TRETU_PLATFORM_URL", u.web],
        ["TRETU_LEGAL_URL", u.web],
        ["TRETU_PRESENCE", "true"],
        ["TRETU_PLAYTIME_EVENTS", "true"],
      ],
    },
    postgres: {
      file: "postgres/roles.env",
      target: "(input of deploy/scripts/create-databases.sh, keep with the secrets)",
      doc: "deploy/GO-LIVE.md",
      lines: DB_ROLES.map((role) => [`${role.toUpperCase()}_DB_PASSWORD`, G(`db.${role}`)]),
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* dotenv rendering / parsing                                                                         */
/* ------------------------------------------------------------------------------------------------ */

export function quote(value) {
  if (value === "") return "";
  if (/^[A-Za-z0-9_.:/@+=,-]+$/.test(value)) return value;
  if (!value.includes("'") && !value.includes("\n")) return `'${value}'`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** Minimal dotenv parser (KEY=value, quotes, comments, `export `). */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (value.startsWith("'")) value = value.slice(1, value.indexOf("'", 1) === -1 ? undefined : value.indexOf("'", 1));
    else if (value.startsWith('"')) {
      const end = value.lastIndexOf('"');
      value = value.slice(1, end > 0 ? end : undefined).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else value = value.replace(/\s+#.*$/, "").trim();
    out[m[1]] = value;
  }
  return out;
}

function resolve(value, s, mode) {
  if (typeof value === "string") return value;
  if (value.secret) return mode === "template" ? "<generated>" : s[value.secret];
  if (value.external) return "";
  if (value.json) {
    if (mode !== "template") return JSON.stringify(value.json);
    return JSON.stringify(value.json, (_k, v) => (typeof v === "string" && /^[0-9a-f]{48,}$|^[A-Za-z0-9_-]{40,}$/.test(v) ? "<generated>" : v));
  }
  if (value.db) {
    const [role, db] = value.db;
    return dbUrl(role, db, mode === "template" ? "<generated>" : s[`db.${role}`], value);
  }
  throw new Error("unknown value");
}

function renderEnv(name, spec, s, mode, imported = {}) {
  const header = [
    `# ${name}: generated by deploy/scripts/generate-secrets.mjs${mode === "template" ? " (template, no secrets)" : ""}`,
    `# Install as ${spec.target} (chmod 600). See ${spec.doc}.`,
    "# Empty values switch that integration off; fill in the ones marked 'external' by hand.",
  ];
  const lines = [...header];
  const known = new Set();
  for (const entry of spec.lines) {
    if (typeof entry === "string") {
      lines.push("", entry);
      continue;
    }
    const [key, value, comment] = entry;
    known.add(key);
    const note = comment ?? (typeof value === "object" && value.external ? `external${value.comment ? `: ${value.comment}` : ""}` : null);
    if (note) lines.push(`# ${note}`);
    const importedValue = mode === "template" ? undefined : imported[key];
    const generated = resolve(value, s, mode);
    // Imported values win, except for the shared JSON configs (always rebuilt from the secret set).
    const final = importedValue !== undefined && importedValue !== "" && !(typeof value === "object" && (value.json || value.secret || value.db)) ? importedValue : generated;
    lines.push(`${key}=${quote(final)}`);
  }
  const extra = Object.keys(imported).filter((k) => !known.has(k));
  if (mode !== "template" && extra.length) {
    lines.push("", "# Kept from the imported env file (not part of the template)");
    for (const key of extra) lines.push(`${key}=${quote(imported[key])}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderNakamaYaml(domain, s, mode) {
  const v = (name) => (mode === "template" ? "<generated>" : s[name]);
  const u = urls(domain);
  return `# hollowmere server/nakama/local.yml: generated by deploy/scripts/generate-secrets.mjs${mode === "template" ? " (template, no secrets)" : ""}
# Install as ${APPS.hollowmere.dir}/server/nakama/local.yml (chmod 600). See hollowmere HOSTING.md.
database:
  address:
    - "nakama:${v("db.nakama")}@127.0.0.1:5432/nakama"
session:
  encryption_key: "${v("nakama.sessionKey")}"
  refresh_encryption_key: "${v("nakama.refreshKey")}"
runtime:
  # Same value as NAKAMA_HTTP_KEY in server/.env.
  http_key: "${v("nakama.httpKey")}"
  env:
    - "TRETU_AUTH_ISSUER=${u.auth}"
    - "TRETU_PLATFORM_URL=${u.web}"
    - "TRETU_APP_ID=hollowmere"
    - "TRETU_APP_SECRET=${v("app.hollowmere")}"
    - "HOLLOWMERE_PUBLIC_URL=${u.hollowmere}"
    - "TRETU_PLATFORM_BACKOFF_SEC=15"
console:
  # Nakama console (127.0.0.1:7351 only, reach it through an SSH tunnel).
  username: "admin"
  password: "${v("nakama.consolePassword")}"
social:
  apple:
    bundle_id: "com.hollowmere.unset"
`;
}

/** Imported env files → logical secret names (so imported secrets flow into the shared JSON configs). */
const IMPORT_SECRET_KEYS = {
  "tretu-web": { AUTH_SECRET: "tretu-web.authSecret", TRETU_APP_SECRET: "app.tretu-web", TRETU_AUTH_CLIENT_SECRET: "oauth.tretu-web", WEB_PUSH_PUBLIC_KEY: "tretu-web.vapidPublic", WEB_PUSH_PRIVATE_KEY: "tretu-web.vapidPrivate" },
  auth: { BETTER_AUTH_SECRET: "auth.betterAuthSecret", TRETU_APP_SECRET: "app.auth" },
  saga: { AUTH_SECRET: "saga.authSecret", BETTER_AUTH_SECRET: "saga.authSecret", TRETU_APP_SECRET: "app.saga", TRETU_AUTH_CLIENT_SECRET: "oauth.saga" },
  play: { BETTER_AUTH_SECRET: "play.betterAuthSecret", TRETU_APP_SECRET: "app.play", TRETU_AUTH_CLIENT_SECRET: "oauth.play", VAPID_PUBLIC_KEY: "play.vapidPublic", VAPID_PRIVATE_KEY: "play.vapidPrivate" },
  hollowmere: { NAKAMA_HTTP_KEY: "nakama.httpKey" },
  "mc-dashboard": { TRETU_APP_SECRET: "app.mc-dashboard", TRETU_AUTH_CLIENT_SECRET: "oauth.mc-dashboard" },
};
const MIN_IMPORTED_SECRET = 16;

/**
 * Builds every file. `imports` = { app: parsedEnv }. Returns { secrets, files: [{ rel, content, target }] }.
 * `mode: "template"` renders placeholders instead of secrets.
 */
export function buildEcosystem({ domain = "tretu.de", secrets = {}, imports = {}, mode = "files" } = {}) {
  const seeded = { ...secrets };
  for (const [app, env] of Object.entries(imports)) {
    for (const [key, name] of Object.entries(IMPORT_SECRET_KEYS[app] ?? {})) {
      const value = env[key];
      if (value && value.length >= MIN_IMPORTED_SECRET && !value.startsWith("replace-") && !value.includes("CHANGE")) seeded[name] = value;
    }
  }
  const s = completeSecrets(seeded);
  const sp = specs(domain, s);
  const files = Object.entries(sp).map(([app, spec]) => ({
    app,
    rel: mode === "template" ? `${spec.file.split("/")[0]}.${path.basename(spec.file).replace(/^\./, "")}.example` : spec.file,
    target: spec.target,
    content: renderEnv(app, spec, s, mode, imports[app] ?? {}),
  }));
  files.push({
    app: "hollowmere",
    rel: mode === "template" ? "hollowmere.local.yml.example" : "hollowmere/local.yml",
    target: `${APPS.hollowmere.dir}/server/nakama/local.yml`,
    content: renderNakamaYaml(domain, s, mode),
  });
  return { secrets: s, files };
}

/* ------------------------------------------------------------------------------------------------ */
/* CLI                                                                                                */
/* ------------------------------------------------------------------------------------------------ */

function writePrivate(file, content) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(file), 0o700);
  writeFileSync(file, content, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function parseArgs(argv) {
  const args = { out: null, templates: null, domain: "tretu.de", imports: {}, fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--out") args.out = next();
    else if (a === "--templates") args.templates = next();
    else if (a === "--domain") args.domain = next();
    else if (a === "--fresh") args.fresh = true;
    else if (a === "--import") {
      const [app, file] = next().split("=");
      if (!IMPORT_SECRET_KEYS[app] || !file) throw new Error(`--import expects <app>=<file>, app one of ${Object.keys(IMPORT_SECRET_KEYS).join(", ")}`);
      args.imports[app] = file;
    } else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(args.domain)) throw new Error("--domain must be a domain like tretu.de");
  return args;
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const args = parseArgs(argv);
  if (args.help || (!args.out && !args.templates)) {
    log("Usage: generate-secrets.mjs --out <dir> [--domain tretu.de] [--import <app>=<env file>]… [--fresh]\n       generate-secrets.mjs --templates <dir>");
    return args.help ? 0 : 2;
  }
  if (args.templates) {
    const { files } = buildEcosystem({ domain: args.domain, mode: "template" });
    mkdirSync(args.templates, { recursive: true });
    for (const f of files) writeFileSync(path.join(args.templates, f.rel), f.content);
    log(`Wrote ${files.length} templates to ${args.templates}`);
    return 0;
  }
  const out = path.resolve(args.out);
  const stateFile = path.join(out, STATE_FILE);
  let state = {};
  if (!args.fresh && existsSync(stateFile)) {
    const parsed = JSON.parse(readFileSync(stateFile, "utf8"));
    if (parsed.domain && parsed.domain !== args.domain) throw new Error(`${stateFile} was generated for ${parsed.domain}; use --fresh or another --out`);
    state = parsed.secrets ?? {};
  }
  const imports = Object.fromEntries(Object.entries(args.imports).map(([app, file]) => [app, parseEnv(readFileSync(file, "utf8"))]));
  const before = new Set(Object.keys(state));
  const { secrets, files } = buildEcosystem({ domain: args.domain, secrets: state, imports });
  mkdirSync(out, { recursive: true, mode: 0o700 });
  chmodSync(out, 0o700);
  writePrivate(stateFile, `${JSON.stringify({ domain: args.domain, secrets }, null, 2)}\n`);
  for (const f of files) writePrivate(path.join(out, f.rel), f.content);

  const generated = Object.keys(secrets).filter((k) => !before.has(k)).length;
  log(`Secrets for ${args.domain}: ${Object.keys(secrets).length} (${generated} new, ${Object.keys(secrets).length - generated} kept) in ${stateFile}`);
  log("");
  log("FILE                                INSTALL AS");
  for (const f of files) log(`${path.join(path.basename(out), f.rel).padEnd(36)}${f.target}`);
  for (const app of Object.keys(imports)) log(`imported: ${app} (${args.imports[app]})`);
  log("");
  log("All files are mode 600. Copy each to its place (install -m 600 -o <app user>), never into a repository.");
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`generate-secrets: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
