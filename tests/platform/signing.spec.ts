import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { closeDatabase, signedRequest, TEST_APPS } from "./helpers";
import { authenticateSignedRequest, appRateLimiter } from "../../src/lib/platform/http";
import { RateLimiter } from "../../src/lib/platform/rate-limit";
import { computeSignature, sha256Hex, signatureBase, verifySignature } from "../../src/lib/platform/signing";

const VECTOR_BODY =
  '{"id":"0b9f1c2e-1111-4a5b-8c9d-123456789abc","type":"stat.increment","app":"saga","sub":"user-sub-1","occurredAt":"2026-01-01T00:00:00.000Z","data":{"key":"saga.turns","by":1}}';

before(() => appRateLimiter.reset());
after(closeDatabase);

test("contract §3 test vector: POST /api/v1/events", () => {
  assert.equal(sha256Hex(VECTOR_BODY), "4602011a4e61b23f5671fd07a722d0dbfa8ceefa4556218afc5d4aee7292062b");
  assert.equal(
    computeSignature("test-secret-123", {
      timestamp: "1767225600",
      method: "POST",
      pathWithQuery: "/api/v1/events",
      body: VECTOR_BODY,
    }),
    "v1=f1a93767113e533347f3fc19e2ea26de609e2848ca366017516d7752c230243d"
  );
});

test("contract §3 test vector: GET /api/v1/wallet/user-sub-1", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(
    computeSignature("test-secret-123", {
      timestamp: 1767225600,
      method: "get",
      pathWithQuery: "/api/v1/wallet/user-sub-1",
      body: "",
    }),
    "v1=2b0726b5f46af3137ecc0e51e27183533e357d620e2ab128fd7165610bc9ca6f"
  );
  assert.equal(
    signatureBase({ timestamp: 1, method: "get", pathWithQuery: "/x?a=1", body: "" }),
    "1\nGET\n/x?a=1\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});

test("verifySignature: window of 300 s and constant-time mismatch", () => {
  const input = { timestamp: "1767225600", method: "POST", pathWithQuery: "/api/v1/events", body: VECTOR_BODY };
  const signature = "v1=f1a93767113e533347f3fc19e2ea26de609e2848ca366017516d7752c230243d";
  const at = (s: number) => new Date(s * 1000);
  assert.deepEqual(verifySignature("test-secret-123", { ...input, signature }, at(1767225600 + 300)), { ok: true });
  assert.deepEqual(verifySignature("test-secret-123", { ...input, signature }, at(1767225600 - 300)), { ok: true });
  assert.deepEqual(verifySignature("test-secret-123", { ...input, signature }, at(1767225600 + 301)), {
    ok: false,
    reason: "timestamp",
  });
  assert.equal(verifySignature("wrong", { ...input, signature }, at(1767225600)).ok, false);
  assert.equal(verifySignature("test-secret-123", { ...input, signature: "v1=00" }, at(1767225600)).ok, false);
  assert.equal(verifySignature("test-secret-123", { ...input, body: VECTOR_BODY + " ", signature }, at(1767225600)).ok, false);
  assert.equal(verifySignature("test-secret-123", { ...input, timestamp: "abc", signature }, at(1767225600)).ok, false);
});

test("authenticateSignedRequest accepts valid requests and rejects tampering", async () => {
  const ok = await authenticateSignedRequest(await signedRequest("saga", "GET", "/api/v1/wallet/u1?limit=5"));
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.app, "saga");

  const unknown = await authenticateSignedRequest(await signedRequest("evil", "GET", "/api/v1/badges", undefined, { secret: "x" }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.response.status, 401);
    assert.deepEqual(await unknown.response.json(), { error: "unauthorized" });
  }

  const wrongSecret = await authenticateSignedRequest(
    await signedRequest("saga", "GET", "/api/v1/badges", undefined, { secret: TEST_APPS.play.secret })
  );
  assert.equal(wrongSecret.ok, false);

  const old = await authenticateSignedRequest(
    await signedRequest("saga", "GET", "/api/v1/badges", undefined, { now: new Date(Date.now() - 301_000) })
  );
  assert.equal(old.ok, false);

  // Signed for another path.
  const req = await signedRequest("saga", "GET", "/api/v1/badges");
  const moved = new Request("http://localhost:3020/api/v1/badges?x=1", { headers: req.headers });
  assert.equal((await authenticateSignedRequest(moved)).ok, false);

  const missing = await authenticateSignedRequest(new Request("http://localhost:3020/api/v1/badges"));
  assert.equal(missing.ok, false);
});

test("rate limiter: per key, refills over time", () => {
  const limiter = new RateLimiter(() => 60, () => 3);
  const t = 1_000_000;
  assert.equal(limiter.take("a", 1, t), 0);
  assert.equal(limiter.take("a", 1, t), 0);
  assert.equal(limiter.take("a", 1, t), 0);
  assert.ok(limiter.take("a", 1, t) > 0);
  assert.equal(limiter.take("b", 1, t), 0);
  assert.equal(limiter.take("a", 1, t + 1000), 0);
});

test("signed requests are rate limited per app", async () => {
  process.env.TRETU_PLATFORM_RATE_LIMIT_BURST = "2";
  process.env.TRETU_PLATFORM_RATE_LIMIT_PER_MIN = "1";
  try {
    appRateLimiter.reset();
    assert.equal((await authenticateSignedRequest(await signedRequest("play", "GET", "/api/v1/badges"))).ok, true);
    assert.equal((await authenticateSignedRequest(await signedRequest("play", "GET", "/api/v1/badges"))).ok, true);
    const limited = await authenticateSignedRequest(await signedRequest("play", "GET", "/api/v1/badges"));
    assert.equal(limited.ok, false);
    if (!limited.ok) assert.equal(limited.response.status, 429);
    assert.equal((await authenticateSignedRequest(await signedRequest("saga", "GET", "/api/v1/badges"))).ok, true);
  } finally {
    delete process.env.TRETU_PLATFORM_RATE_LIMIT_BURST;
    delete process.env.TRETU_PLATFORM_RATE_LIMIT_PER_MIN;
    appRateLimiter.reset();
  }
});
