/** node --test deploy/scripts/smoke.test.mjs — smoke.sh against a local stand-in for every service. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SECRET = "smoke-test-secret-0123456789abcdef";
let server;
let origin;
const state = { sagaDown: false, seenSecretInHeaders: false };

function signatureOk(req) {
  const ts = String(req.headers["x-tretu-timestamp"] ?? "");
  const base = [ts, req.method, req.url.replace(/^\/web/, ""), createHash("sha256").update("").digest("hex")].join("\n");
  const expected = Buffer.from("v1=" + createHmac("sha256", SECRET).update(base).digest("hex"));
  const given = Buffer.from(String(req.headers["x-tretu-signature"] ?? ""));
  if (JSON.stringify(req.headers).includes(SECRET)) state.seenSecretInHeaders = true;
  return req.headers["x-tretu-app"] === "tretu-web" && Math.abs(Date.now() / 1000 - Number(ts)) < 300 && given.length === expected.length && timingSafeEqual(given, expected);
}

before(async () => {
  server = createServer((req, res) => {
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
    if (name === "stats" && p === "/api/heartbeat") return send(200, { ok: true });
    if (name === "status" && p === "/") return send(302, {});
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

function smoke(extraArgs = [], env = {}) {
  const maps = ["web", "auth", "saga", "play", "hollowmere", "mc", "stats", "status"].flatMap((n) => ["--map", `${n}=${origin}/${n}`]);
  return new Promise((resolve) => {
    const child = spawn("bash", [path.join(here, "smoke.sh"), ...maps, "--timeout", "5", ...extraArgs], { env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });
}

test("all services healthy and the signed ping accepted → exit 0, table of PASS rows", async () => {
  const { code, out } = await smoke([], { SMOKE_APP_SECRET: SECRET });
  assert.equal(code, 0, out);
  for (const check of ["health web", "health auth", "health saga", "health play", "health hollowmere", "health mc", "umami", "uptime kuma", "oidc discovery", "oidc jwks", "platform unsigned", "platform signed ping"]) {
    assert.match(out, new RegExp(`^${check}\\s+PASS`, "m"), check);
  }
  assert.match(out, /all checks passed/);
  assert.ok(!out.includes(SECRET), "secret never printed");
  assert.equal(state.seenSecretInHeaders, false);
});

test("a failing service, a wrong secret and a missing secret show up in the table", async () => {
  state.sagaDown = true;
  const bad = await smoke([], { SMOKE_APP_SECRET: "wrong-secret-0123456789abcdef" });
  state.sagaDown = false;
  assert.equal(bad.code, 1);
  assert.match(bad.out, /^health saga\s+FAIL .*HTTP 503 status=error db=error/m);
  assert.match(bad.out, /^platform signed ping\s+FAIL .*secret differs/m);
  assert.match(bad.out, /2 check\(s\) FAILED/);

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
