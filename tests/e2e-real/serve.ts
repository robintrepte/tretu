/**
 * Starts the REAL auth.tretu.de and the REAL hub for tests/e2e-real (no mocks between them), like production
 * minus TLS and PM2:
 *
 * 1. fresh databases (auth + hub), migrations of both, `npm run clients:sync` in auth with a confidential
 *    `tretu-web` client (redirect URI on this hub);
 * 2. auth (`next start`) with TRETU_APPS_JSON knowing the tretu-web secret, event delivery to this hub, and its
 *    events worker (`npm run worker:events`, delivers what the CLI records);
 * 3. the hub (`next start`) with the Tretu-Konto provider on that auth, TRETU_ADMIN_FROM_ROLES on, and the
 *    platform worker (`npm run platform:worker`: status checks of both apps, jobs, webhooks).
 *
 * Needs both builds first: `npm run build` (root) and `npm --prefix auth run build`.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

import { ADMIN_DATABASE_URL, AUTH_DATABASE_URL, AUTH_DIR, AUTH_PORT, AUTH_URL, HUB_DATABASE_URL, HUB_PORT, HUB_URL, MAIL_DIR, ROOT, SECRETS } from "./env";

for (const [dir, command] of [
  [ROOT, "npm run build"],
  [AUTH_DIR, "npm --prefix auth run build"],
] as const) {
  if (!existsSync(path.join(dir, ".next", "BUILD_ID"))) {
    console.error(`[e2e-real] missing build in ${dir}: run \`${command}\` first`);
    process.exit(1);
  }
}

/** The same environment for every child: no proxies for loopback traffic, no secrets of the shell. */
const base: NodeJS.ProcessEnv = { ...process.env, NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1" };
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "TRETU_APPS_JSON", "TRETU_APP_SECRET", "TRETU_AUTH_ISSUER", "DATABASE_URL"]) delete base[key];

const appsJson = JSON.stringify({ "tretu-web": { secret: SECRETS.web }, auth: { secret: SECRETS.auth } });

const authEnv: NodeJS.ProcessEnv = {
  ...base,
  NODE_ENV: "production",
  DATABASE_URL: AUTH_DATABASE_URL,
  TRETU_AUTH_ISSUER: AUTH_URL,
  BETTER_AUTH_SECRET: SECRETS.authSession,
  AUTH_RATE_LIMIT: "off",
  AUTH_HIBP: "off",
  MAIL_OUTBOX_DIR: MAIL_DIR,
  CLIENTS_SYNC_ON_START: "false",
  TRETU_OAUTH_CLIENTS_JSON: JSON.stringify({
    "tretu-web": { type: "confidential", secret: SECRETS.client, redirectUris: [`${HUB_URL}/api/auth/oauth2/callback/tretu`] },
  }),
  TRETU_APPS_JSON: appsJson,
  // Events (user.created / user.updated / user.deleted) go to this hub, signed as `auth`.
  TRETU_PLATFORM_URL: HUB_URL,
  TRETU_APP_SECRET: SECRETS.auth,
  TRETU_LEGAL_URL: HUB_URL,
};

const hubEnv: NodeJS.ProcessEnv = {
  ...base,
  NODE_ENV: "production",
  DATABASE_URL: HUB_DATABASE_URL,
  AUTH_SECRET: SECRETS.hubSession,
  BETTER_AUTH_URL: HUB_URL,
  ORCHESTRATOR_EMBEDDED: "false",
  AUTH_RATE_LIMIT: "off",
  TRETU_AUTH_ISSUER: AUTH_URL,
  TRETU_AUTH_CLIENT_ID: "tretu-web",
  TRETU_AUTH_CLIENT_SECRET: SECRETS.client,
  TRETU_ADMIN_FROM_ROLES: "true",
  TRETU_APPS_JSON: appsJson,
  TRETU_APP_SECRET: SECRETS.web,
  // /status and the admin overview: the two real apps (Minecraft and TeamSpeak off).
  TRETU_STATUS_TARGETS_JSON: JSON.stringify([
    { id: "tretu-web", url: `${HUB_URL}/api/health` },
    { id: "auth", url: `${AUTH_URL}/api/health` },
  ]),
  TRETU_STATUS_MINECRAFT: "off",
};

async function resetDatabase(url: string) {
  const name = new URL(url).pathname.slice(1);
  const sql = postgres(ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe(`drop database if exists "${name}" with (force)`);
  await sql.unsafe(`create database "${name}"`);
  await sql.end();
}

function run(label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[e2e-real] ${label} failed`);
    process.exit(1);
  }
}

const children: ChildProcess[] = [];
function start(label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { cwd, env, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`[e2e-real] ${label} exited (${signal ?? code})`);
    stop(1);
  });
  return child;
}

let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1500).unref();
}

async function waitFor(url: string, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up`);
}

const next = (cwd: string) => path.join(cwd, "node_modules/next/dist/bin/next");

async function main() {
  rmSync(MAIL_DIR, { recursive: true, force: true });
  await resetDatabase(AUTH_DATABASE_URL);
  await resetDatabase(HUB_DATABASE_URL);
  run("auth migrations", "npx", ["tsx", "scripts/migrate.ts"], AUTH_DIR, authEnv);
  run("auth clients:sync", "npm", ["run", "clients:sync"], AUTH_DIR, authEnv);
  run("hub migrations", "npm", ["run", "db:migrate"], ROOT, hubEnv);

  start("auth", process.execPath, [next(AUTH_DIR), "start", "-p", String(AUTH_PORT)], AUTH_DIR, authEnv);
  start("auth events worker", "npm", ["run", "worker:events"], AUTH_DIR, authEnv);
  await waitFor(`${AUTH_URL}/api/health`);
  start("hub", process.execPath, [next(ROOT), "start", "-p", String(HUB_PORT)], ROOT, hubEnv);
  await waitFor(`${HUB_URL}/api/health`);
  start("hub platform worker", "npm", ["run", "platform:worker"], ROOT, hubEnv);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stop(0));
main().catch((error: unknown) => {
  console.error(error);
  stop(1);
});
