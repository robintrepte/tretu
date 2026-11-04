/** node --test deploy/scripts/generate-secrets.test.mjs — the generated env files are mutually consistent. */
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildEcosystem, DB_ROLES, main, parseEnv, REMOVED_KEYS, SIGNING_APPS, STATE_FILE } from "./generate-secrets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), "tretu-secrets-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function run(argv) {
  const lines = [];
  const code = main(argv, (line) => lines.push(line));
  return { code, output: lines.join("\n") };
}

function load(out) {
  const env = (rel) => parseEnv(readFileSync(path.join(out, rel), "utf8"));
  return {
    web: env("tretu-web/.env.local"),
    auth: env("tretu-auth/.env"),
    saga: env("saga/.env"),
    play: env("play/.env"),
    hollowmere: env("hollowmere/server.env"),
    mc: env("mc-dashboard/.env"),
    city: env("city/.env"),
    roles: env("postgres/roles.env"),
    nakamaYaml: readFileSync(path.join(out, "hollowmere/local.yml"), "utf8"),
  };
}

const out = path.join(tmp, "secrets");
const first = run(["--out", out]);
const files = load(out);

test("one TRETU_APP_SECRET per app, identical in TRETU_APPS_JSON on tretu.de and auth, with webhooks", () => {
  assert.equal(first.code, 0);
  const apps = JSON.parse(files.web.TRETU_APPS_JSON);
  assert.deepEqual(JSON.parse(files.auth.TRETU_APPS_JSON), apps);
  assert.deepEqual(Object.keys(apps).sort(), [...SIGNING_APPS].sort());
  assert.equal(apps["tretu-web"].secret, files.web.TRETU_APP_SECRET);
  assert.equal(apps.auth.secret, files.auth.TRETU_APP_SECRET);
  assert.equal(apps.saga.secret, files.saga.TRETU_APP_SECRET);
  assert.equal(apps.play.secret, files.play.TRETU_APP_SECRET);
  assert.equal(apps["mc-dashboard"].secret, files.mc.TRETU_APP_SECRET);
  assert.match(files.nakamaYaml, new RegExp(`"TRETU_APP_SECRET=${apps.hollowmere.secret}"`));
  assert.equal(apps.saga.webhook, "https://saga.tretu.de/api/tretu/webhook");
  assert.equal(apps.play.webhook, "https://play.tretu.de/api/tretu/webhook");
  assert.equal(apps["mc-dashboard"].webhook, "https://mc.tretu.de/api/tretu/webhook");
  assert.equal(apps.hollowmere.webhook, "https://hollowmere.tretu.de/api/tretu/webhook");
  const secrets = Object.values(apps).map((a) => a.secret);
  assert.equal(new Set(secrets).size, secrets.length, "all different");
  for (const secret of secrets) assert.ok(secret.length >= 32);
  for (const env of [files.saga, files.play, files.mc]) assert.equal(env.TRETU_PLATFORM_URL, "https://tretu.de");
  assert.equal(files.saga.TRETU_APP_ID, "saga");
  // The Tretu server's Saga storage, the default of Saga's nginx file ($saga_storage).
  assert.equal(files.saga.STORAGE_DIR, "/var/www/saga.tretu.de/public/images");
  assert.equal(files.play.TRETU_APP_ID, "play");
  assert.equal(files.mc.TRETU_APP_ID, "mc-dashboard");
  // City signs nothing yet: no app secret, no webhook.
  assert.equal(apps.city, undefined);
  for (const key of ["TRETU_APP_ID", "TRETU_APP_SECRET", "TRETU_PLATFORM_URL"]) assert.equal(files.city[key], undefined, key);
});

test("TRETU_OAUTH_CLIENTS_JSON matches every client's id, secret, redirect and post-logout URI", () => {
  const clients = JSON.parse(files.auth.TRETU_OAUTH_CLIENTS_JSON);
  const expect = {
    "tretu-web": [files.web, "https://tretu.de/api/auth/oauth2/callback/tretu", "https://tretu.de/"],
    saga: [files.saga, "https://saga.tretu.de/api/auth/oauth2/callback/tretu", "https://saga.tretu.de/"],
    play: [files.play, "https://play.tretu.de/api/auth/oauth2/callback/tretu", "https://play.tretu.de/"],
    "mc-dashboard": [files.mc, "https://mc.tretu.de/auth/callback", "https://mc.tretu.de/"],
    city: [files.city, "https://city.tretu.de/auth/callback", "https://city.tretu.de/"],
  };
  for (const [id, [env, redirect, logout]] of Object.entries(expect)) {
    assert.equal(clients[id].type, "confidential");
    assert.equal(env.TRETU_AUTH_CLIENT_ID, id);
    assert.equal(env.TRETU_AUTH_CLIENT_SECRET, clients[id].secret, id);
    assert.ok(clients[id].secret.length >= 32);
    assert.deepEqual(clients[id].redirectUris, [redirect]);
    assert.deepEqual(clients[id].postLogoutRedirectUris, [logout]);
    assert.equal(env.TRETU_AUTH_ISSUER, "https://auth.tretu.de");
  }
  // App base URLs agree with their redirect URIs.
  assert.equal(files.web.BETTER_AUTH_URL, "https://tretu.de");
  assert.equal(files.saga.AUTH_URL, "https://saga.tretu.de");
  assert.equal(files.play.APP_URL, "https://play.tretu.de");
  assert.equal(files.mc.PUBLIC_URL, "https://mc.tretu.de");
  assert.equal(files.city.CITY_PUBLIC_URL, "https://city.tretu.de");
  assert.equal(clients.city.name, "Tretu City");
  assert.deepEqual(clients.hollowmere, {
    type: "public",
    name: "Hollowmere",
    redirectUris: ["https://hollowmere.tretu.de/auth/callback", "http://127.0.0.1/callback"],
    postLogoutRedirectUris: ["https://hollowmere.tretu.de/"],
  });
  assert.match(files.nakamaYaml, /"TRETU_AUTH_ISSUER=https:\/\/auth\.tretu\.de"/);
  assert.equal(files.auth.TRETU_AUTH_ISSUER, "https://auth.tretu.de");
});

test("database URLs use one role per app with the passwords from roles.env", () => {
  const url = (value) => new URL(value);
  const checks = [
    [files.web.DATABASE_URL, "tretu_web", "tretu_web"],
    [files.auth.DATABASE_URL, "tretu_auth", "tretu_auth"],
    [files.saga.DATABASE_URL, "saga", "saga"],
    [files.play.DATABASE_URL, "play", "play"],
    [files.mc.DATABASE_URL, "mc_dashboard", "mc_dashboard"],
    [files.city.DATABASE_URL, "city", "city"],
    [files.auth.LEGACY_SAGA_DATABASE_URL, "tretu_legacy_reader", "saga"],
    [files.auth.LEGACY_PLAY_DATABASE_URL, "tretu_legacy_reader", "play"],
    [files.auth.LEGACY_TRETU_DATABASE_URL, "tretu_legacy_reader", "tretu_web"],
    [files.auth.LEGACY_NAKAMA_DATABASE_URL, "tretu_legacy_reader", "nakama"],
  ];
  for (const [value, role, db] of checks) {
    const u = url(value);
    assert.equal(u.username, role);
    assert.equal(u.pathname, `/${db}`);
    assert.equal(u.password, files.roles[`${role.toUpperCase()}_DB_PASSWORD`], role);
  }
  assert.equal(url(files.saga.DATABASE_URL).search, "?schema=public");
  assert.match(files.nakamaYaml, new RegExp(`"nakama:${files.roles.NAKAMA_DB_PASSWORD}@127\\.0\\.0\\.1:5432/nakama"`));
  assert.deepEqual(Object.keys(files.roles).sort(), DB_ROLES.map((r) => `${r.toUpperCase()}_DB_PASSWORD`).sort());
  assert.equal(new Set(Object.values(files.roles)).size, DB_ROLES.length);
});

test("Nakama http_key equals NAKAMA_HTTP_KEY; session secrets are long and distinct", () => {
  assert.match(files.nakamaYaml, new RegExp(`http_key: "${files.hollowmere.NAKAMA_HTTP_KEY}"`));
  const secrets = [files.web.AUTH_SECRET, files.auth.BETTER_AUTH_SECRET, files.saga.AUTH_SECRET, files.play.BETTER_AUTH_SECRET];
  for (const s of secrets) assert.ok(s.length >= 32);
  assert.equal(new Set(secrets).size, secrets.length);
});

test("VAPID keys are valid P-256 key pairs (sign / verify)", () => {
  for (const [pub, priv] of [
    [files.web.WEB_PUSH_PUBLIC_KEY, files.web.WEB_PUSH_PRIVATE_KEY],
    [files.play.VAPID_PUBLIC_KEY, files.play.VAPID_PRIVATE_KEY],
  ]) {
    const point = Buffer.from(pub, "base64url");
    assert.equal(point.length, 65);
    assert.equal(point[0], 4);
    assert.equal(Buffer.from(priv, "base64url").length, 32);
    const jwk = { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") };
    const privateKey = createPrivateKey({ key: { ...jwk, d: priv }, format: "jwk" });
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const signature = sign("sha256", Buffer.from("tretu"), privateKey);
    assert.ok(verify("sha256", Buffer.from("tretu"), publicKey, signature));
  }
  assert.notEqual(files.web.WEB_PUSH_PUBLIC_KEY, files.play.VAPID_PUBLIC_KEY);
});

test("files are mode 600 in 700 directories; nothing secret is printed", () => {
  assert.equal(statSync(out).mode & 0o777, 0o700);
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const all = walk(out);
  assert.equal(all.length, 10);
  for (const file of all) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
    assert.equal(statSync(path.dirname(file)).mode & 0o777, 0o700, path.dirname(file));
  }
  const state = JSON.parse(readFileSync(path.join(out, STATE_FILE), "utf8"));
  for (const value of Object.values(state.secrets)) assert.ok(!first.output.includes(value), "secret printed");
});

test("idempotent: a second run writes the same files", () => {
  const before = Object.fromEntries(["tretu-web/.env.local", "tretu-auth/.env", "hollowmere/local.yml", "postgres/roles.env"].map((f) => [f, readFileSync(path.join(out, f), "utf8")]));
  const second = run(["--out", out]);
  assert.equal(second.code, 0);
  assert.match(second.output, /\(0 new, \d+ kept\)/);
  for (const [f, content] of Object.entries(before)) assert.equal(readFileSync(path.join(out, f), "utf8"), content, f);
  const fresh = run(["--out", out, "--fresh"]);
  assert.equal(fresh.code, 0);
  assert.notEqual(readFileSync(path.join(out, "postgres/roles.env"), "utf8"), before["postgres/roles.env"]);
});

test("--import keeps a running app's secrets and settings and feeds them into the shared configs", () => {
  const existing = path.join(tmp, "saga.env");
  writeFileSync(
    existing,
    [
      'AUTH_SECRET="existing-saga-session-secret-0123456789abcdef"',
      "OPENAI_API_KEY=sk-test-123",
      "TRETU_APP_SECRET=existing-saga-app-secret-0123456789abcdef",
      "STORAGE_DIR=/data/saga",
      "SOMETHING_CUSTOM='kept as is'",
      "DISCORD_CLIENT_ID=",
      "DISCORD_BOT_TOKEN=bot-token-kept",
      "GOOGLE_CLIENT_SECRET=old-google-secret",
      "TRETU_LOCAL_LOGIN=false",
    ].join("\n")
  );
  const dir = path.join(tmp, "imported");
  assert.equal(run(["--out", dir, "--import", `saga=${existing}`]).code, 0);
  const env = load(dir);
  assert.equal(env.saga.AUTH_SECRET, "existing-saga-session-secret-0123456789abcdef");
  assert.equal(env.saga.OPENAI_API_KEY, "sk-test-123");
  assert.equal(env.saga.STORAGE_DIR, "/data/saga");
  assert.equal(env.saga.SOMETHING_CUSTOM, "kept as is");
  assert.equal(env.saga.TRETU_APP_SECRET, "existing-saga-app-secret-0123456789abcdef");
  assert.equal(JSON.parse(env.web.TRETU_APPS_JSON).saga.secret, "existing-saga-app-secret-0123456789abcdef");
  assert.equal(JSON.parse(env.auth.TRETU_APPS_JSON).saga.secret, "existing-saga-app-secret-0123456789abcdef");
  // Settings of removed sign-in methods are dropped (named, never their values); the Discord bot stays.
  assert.equal(env.saga.DISCORD_BOT_TOKEN, "bot-token-kept");
  for (const key of ["DISCORD_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TRETU_LOCAL_LOGIN"]) assert.equal(env.saga[key], undefined, key);
  const raw = readFileSync(path.join(dir, "saga/.env"), "utf8");
  assert.match(raw, /# Dropped from the imported env file \(sign-in methods removed, Tretu-Konto only\): DISCORD_CLIENT_ID, GOOGLE_CLIENT_SECRET, TRETU_LOCAL_LOGIN/);
  assert.ok(!raw.includes("old-google-secret"));
});

test("Tretu-Konto only: TRETU_AUTH_* filled for every app, no setting of a removed sign-in method left", () => {
  for (const [app, env] of Object.entries({ "tretu-web": files.web, saga: files.saga, play: files.play, "mc-dashboard": files.mc, city: files.city })) {
    assert.equal(env.TRETU_AUTH_ISSUER, "https://auth.tretu.de", app);
    assert.equal(env.TRETU_AUTH_CLIENT_ID, app);
    assert.ok(env.TRETU_AUTH_CLIENT_SECRET.length >= 32, app);
    for (const key of [...(REMOVED_KEYS[app] ?? []), "TRETU_DISCORD_FALLBACK", "TRETU_LOCAL_LOGIN", "TRETU_CODE_LOGIN", "TRETU_SKIP_INVITE_FOR_TRETU"]) {
      assert.equal(env[key], undefined, `${app}: ${key}`);
    }
  }
  assert.doesNotMatch(files.nakamaYaml, /social:|apple|bundle_id/);
  // Kept: the hub's Discord admins (via the discord_id claim), the badge bot and Saga's campaign bot; auth's own providers.
  assert.equal(files.web.DASHBOARD_ADMIN_DISCORD_IDS, "");
  assert.equal(files.web.DISCORD_BOT_TOKEN, "");
  assert.equal(files.saga.DISCORD_BOT_TOKEN, "");
  for (const key of ["DISCORD_CLIENT_ID", "GOOGLE_CLIENT_ID", "APPLE_CLIENT_ID", "STEAM_LOGIN"]) assert.ok(key in files.auth, key);
});

test("other domains (staging) produce matching hosts", () => {
  const { files: built } = buildEcosystem({ domain: "staging.tretu.de" });
  const auth = parseEnv(built.find((f) => f.app === "auth").content);
  assert.equal(auth.TRETU_AUTH_ISSUER, "https://auth.staging.tretu.de");
  assert.deepEqual(JSON.parse(auth.TRETU_OAUTH_CLIENTS_JSON).saga.redirectUris, ["https://saga.staging.tretu.de/api/auth/oauth2/callback/tretu"]);
  const web = parseEnv(built.find((f) => f.app === "tretu-web").content);
  assert.deepEqual(
    JSON.parse(web.TRETU_STATUS_TARGETS_JSON).map((t) => t.url),
    ["https://staging.tretu.de", "https://auth.staging.tretu.de", "https://saga.staging.tretu.de", "https://play.staging.tretu.de", "https://hollowmere.staging.tretu.de", "https://mc.staging.tretu.de", "https://city.staging.tretu.de"].map((h) => `${h}/api/health`)
  );
  assert.throws(() => main(["--out", tmp, "--domain", "not a domain"], () => {}));
});

test("status targets: one /api/health per service, no analytics or status host left", () => {
  const targets = JSON.parse(files.web.TRETU_STATUS_TARGETS_JSON);
  assert.deepEqual(targets.map((t) => t.id), ["tretu-web", "auth", "saga", "play", "hollowmere", "mc-dashboard", "city"]);
  for (const t of targets) assert.match(t.url, /^https:\/\/([a-z]+\.)?tretu\.de\/api\/health$/);
  assert.equal(files.web.TRETU_STATUS_DISCORD_WEBHOOK_URL, "");
  assert.equal(files.web.TRETU_STATUS_MINECRAFT, "mc.tretu.de:25565");
  assert.equal(files.web.TRETU_STATUS_CERT_HOSTS, "map.tretu.de,mcp.hollowmere.tretu.de");
  for (const env of [files.web, files.auth, files.saga, files.play, files.mc, files.city]) {
    for (const key of Object.keys(env)) assert.doesNotMatch(key, /UMAMI/);
    for (const value of Object.values(env)) assert.doesNotMatch(value, /stats\.tretu|status\.tretu/);
  }
});

test("committed deploy/env templates are up to date and contain no secrets", () => {
  const { files: templates } = buildEcosystem({ mode: "template" });
  const dir = path.join(here, "..", "env");
  for (const t of templates) {
    const committed = readFileSync(path.join(dir, t.rel), "utf8");
    assert.equal(committed, t.content, `${t.rel} is stale: run node deploy/scripts/generate-secrets.mjs --templates deploy/env`);
    assert.ok(!/[0-9a-f]{48,}/.test(committed), `${t.rel} contains something secret-looking`);
  }
});
