/** node --test deploy/scripts/smoke.test.mjs — smoke.sh against a local stand-in for every service. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SECRET = "smoke-test-secret-0123456789abcdef";
let server;
let origin;
const state = { sagaDown: false, statusStale: false, seenSecretInHeaders: false, webhooks: [] };
/** Secrets the stand-in apps check webhooks with (play's differs from TRETU_APPS_JSON on purpose). */
const HOOK_SECRETS = { saga: "saga-webhook-secret-0123456789", play: "play-real-secret-0123456789" };

/** Contract §3 check of a platform webhook, as the apps do it (path with query, raw body, ±300 s, constant time). */
function webhookSignatureOk(req, raw, secret) {
  const ts = String(req.headers["x-tretu-timestamp"] ?? "");
  const base = [ts, req.method, req.url, createHash("sha256").update(raw).digest("hex")].join("\n");
  const expected = Buffer.from("v1=" + createHmac("sha256", secret).update(base).digest("hex"));
  const given = Buffer.from(String(req.headers["x-tretu-signature"] ?? ""));
  return req.headers["x-tretu-app"] === "platform" && Math.abs(Date.now() / 1000 - Number(ts)) < 300 && given.length === expected.length && timingSafeEqual(given, expected);
}

function signatureOk(req) {
  const ts = String(req.headers["x-tretu-timestamp"] ?? "");
  const base = [ts, req.method, req.url.replace(/^\/web/, ""), createHash("sha256").update("").digest("hex")].join("\n");
  const expected = Buffer.from("v1=" + createHmac("sha256", SECRET).update(base).digest("hex"));
  const given = Buffer.from(String(req.headers["x-tretu-signature"] ?? ""));
  if (JSON.stringify(req.headers).includes(SECRET)) state.seenSecretInHeaders = true;
  return req.headers["x-tretu-app"] === "tretu-web" && Math.abs(Date.now() / 1000 - Number(ts)) < 300 && given.length === expected.length && timingSafeEqual(given, expected);
}

before(async () => {
  server = createServer(async (req, res) => {
    if (req.url.startsWith("/hooks/")) {
      // Stand-in app webhook: 401 on a bad signature, 204 for types it does not handle (contract §4).
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const app = req.url.slice("/hooks/".length).split("?")[0];
      const ok = req.method === "POST" && webhookSignatureOk(req, raw, HOOK_SECRETS[app] ?? "none");
      state.webhooks.push({ app, ok, headers: req.headers, body: raw ? JSON.parse(raw) : null, url: req.url });
      res.writeHead(ok ? 204 : 401, ok ? {} : { "content-type": "application/json" });
      return res.end(ok ? undefined : JSON.stringify({ error: "unauthorized" }));
    }
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const [, name, ...rest] = req.url.split("/");
    const p = "/" + rest.join("/");
    if (p === "/api/health") {
      if (name === "saga" && state.sagaDown) return send(503, { status: "error", app: "saga", version: "1.0.0", checks: { db: "error" } });
      return send(200, { status: "ok", app: name, version: "1.2.3", time: new Date().toISOString(), checks: { db: "ok" } });
    }
    if (name === "web" && p === "/api/status") {
      const updatedAt = new Date().toISOString();
      return send(200, { status: "ok", updatedAt, stale: state.statusStale, services: [{ id: "tretu-web", state: "up" }, { id: "saga", state: "up" }] });
    }
    if (name === "auth" && p === "/.well-known/openid-configuration") {
      const issuer = `${origin}/auth`;
      return send(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        end_session_endpoint: `${issuer}/logout`,
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (name === "auth" && p === "/jwks") return send(200, { keys: [{ kid: "k1", kty: "RSA", n: "x", e: "AQAB" }] });
    if (name === "web" && p === "/api/v1/badges") {
      return signatureOk(req) ? send(200, { badges: [{ key: "wins-10" }] }) : send(401, { error: "unauthorized" });
    }
    send(404, { error: "not_found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function smoke(extraArgs = [], env = {}, script = "smoke.sh") {
  const maps = ["web", "auth", "saga", "play", "hollowmere", "mc", "city"].flatMap((n) => ["--map", `${n}=${origin}/${n}`]);
  return new Promise((resolve) => {
    const child = spawn("bash", [path.join(here, script), ...maps, "--timeout", "5", ...extraArgs], { env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });
}

test("all services healthy and the signed ping accepted → exit 0, table of PASS rows", async () => {
  const { code, out } = await smoke([], { SMOKE_APP_SECRET: SECRET });
  assert.equal(code, 0, out);
  for (const check of ["health web", "health auth", "health saga", "health play", "health hollowmere", "health mc", "health city", "status page", "oidc discovery", "oidc jwks", "platform unsigned", "platform signed ping"]) {
    assert.match(out, new RegExp(`^${check}\\s+PASS`, "m"), check);
  }
  assert.match(out, /all checks passed/);
  assert.ok(!out.includes(SECRET), "secret never printed");
  assert.equal(state.seenSecretInHeaders, false);
});

test("a failing service, a wrong secret and a missing secret show up in the table", async () => {
  state.sagaDown = true;
  state.statusStale = true;
  const bad = await smoke([], { SMOKE_APP_SECRET: "wrong-secret-0123456789abcdef" });
  state.sagaDown = false;
  state.statusStale = false;
  assert.equal(bad.code, 1);
  assert.match(bad.out, /^health saga\s+FAIL .*HTTP 503 status=error db=error/m);
  assert.match(bad.out, /^platform signed ping\s+FAIL .*secret differs/m);
  assert.match(bad.out, /^status page\s+FAIL .*tretu-platform-worker running/m);
  assert.match(bad.out, /3 check\(s\) FAILED/);

  const noSecret = await smoke(["--only", "web"]);
  assert.equal(noSecret.code, 0, noSecret.out);
  assert.match(noSecret.out, /^platform signed ping\s+SKIP/m);
  assert.doesNotMatch(noSecret.out, /health saga/);
});

test("unreachable hosts fail cleanly", async () => {
  const { code, out } = await smoke(["--only", "play", "--map", "play=http://127.0.0.1:9"]);
  assert.equal(code, 1);
  assert.match(out, /^health play\s+FAIL\s+.*no connection/m);
});

test("--webhook-test: a signed platform.ping to the app's webhook, 204 = PASS, secrets never printed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "smoke-webhook-"));
  const envFile = path.join(dir, ".env.local");
  const apps = {
    "tretu-web": { secret: SECRET },
    saga: { secret: HOOK_SECRETS.saga, webhook: `${origin}/hooks/saga?v=1` },
    play: { secret: "play-stale-secret-0123456789", webhook: `${origin}/hooks/play` },
    hollowmere: { secret: "hollowmere-secret-0123456789" },
  };
  writeFileSync(envFile, `# tretu.de\nTRETU_APP_ID=tretu-web\nTRETU_APP_SECRET=${SECRET}\nexport TRETU_APPS_JSON='${JSON.stringify(apps)}'\n`);
  try {
    state.webhooks = [];
    const one = await smoke(["--env-file", envFile, "--webhook-test", "saga", "--only", "webhook"]);
    assert.equal(one.code, 0, one.out);
    assert.match(one.out, /^webhook saga\s+PASS\s+http:\/\/127\.0\.0\.1:\d+\/hooks\/saga\?v=1\s+204, signature accepted/m);
    assert.doesNotMatch(one.out, /^health /m, "--only webhook leaves the other checks out");
    assert.equal(state.webhooks.length, 1);
    const [hook] = state.webhooks;
    assert.equal(hook.ok, true, "signed with saga's secret over path + query and the exact body");
    assert.equal(hook.headers["x-tretu-app"], "platform");
    assert.equal(hook.headers["content-type"], "application/json");
    assert.equal(hook.body.type, "platform.ping");
    assert.equal(hook.body.app, "platform");
    assert.equal(hook.body.sub, null);
    assert.deepEqual(hook.body.data, {});
    assert.match(hook.body.id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(hook.body.occurredAt)));

    // A wrong secret, an app without a webhook and an unknown app fail with a reason.
    const bad = await smoke(["--env-file", envFile, "--webhook-test", "play,hollowmere", "--webhook-test", "nope", "--only", "webhook"]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /^webhook play\s+FAIL .*401: the app's TRETU_APP_SECRET differs/m);
    assert.match(bad.out, /^webhook hollowmere\s+FAIL .*no webhook configured for hollowmere/m);
    assert.match(bad.out, /^webhook nope\s+FAIL .*nope is not in TRETU_APPS_JSON/m);
    assert.match(bad.out, /3 check\(s\) FAILED/);

    // `all` = every app with a webhook, via `npm run smoke` (deploy/scripts/npm-smoke.sh) with the full check list.
    state.webhooks = [];
    const all = await smoke(["--webhook-test", "all"], { SMOKE_ENV_FILE: envFile }, "npm-smoke.sh");
    assert.equal(all.code, 1, all.out);
    assert.match(all.out, /^webhook saga\s+PASS/m);
    assert.match(all.out, /^webhook play\s+FAIL/m);
    assert.match(all.out, /^health web\s+PASS/m);
    assert.match(all.out, /^platform signed ping\s+PASS/m, "the env file's TRETU_APP_SECRET signs the ping");
    assert.deepEqual(state.webhooks.map((w) => w.app).sort(), ["play", "saga"]);

    for (const run of [one, bad, all]) {
      for (const secret of [SECRET, HOOK_SECRETS.saga, "play-stale-secret-0123456789", "hollowmere-secret-0123456789"]) {
        assert.ok(!run.out.includes(secret), "no secret in the output");
      }
    }
    for (const w of state.webhooks) assert.ok(!JSON.stringify(w.headers).includes(HOOK_SECRETS.saga));

    // Without an env file there is nothing to sign with.
    const none = await smoke(["--webhook-test", "saga", "--only", "webhook"]);
    assert.equal(none.code, 1);
    assert.match(none.out, /^webhook saga\s+FAIL .*TRETU_APPS_JSON not found/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
