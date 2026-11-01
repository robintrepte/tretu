import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

/**
 * Ecosystem contract §3 (signed server-to-server requests). This repository hosts the platform API, so the
 * test vectors are pinned here as well; the platform implementation must produce exactly these values.
 */
function sign(secret: string, timestamp: string, method: string, pathWithQuery: string, rawBody: string) {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const base = `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}\n${bodyHash}`;
  return { bodyHash, signature: `v1=${createHmac("sha256", secret).update(base).digest("hex")}` };
}

test("contract §3 test vector: POST /api/v1/events", () => {
  const body =
    '{"id":"0b9f1c2e-1111-4a5b-8c9d-123456789abc","type":"stat.increment","app":"saga","sub":"user-sub-1","occurredAt":"2026-01-01T00:00:00.000Z","data":{"key":"saga.turns","by":1}}';
  const { bodyHash, signature } = sign("test-secret-123", "1767225600", "POST", "/api/v1/events", body);
  assert.equal(bodyHash, "4602011a4e61b23f5671fd07a722d0dbfa8ceefa4556218afc5d4aee7292062b");
  assert.equal(signature, "v1=f1a93767113e533347f3fc19e2ea26de609e2848ca366017516d7752c230243d");
});

test("contract §3 test vector: GET /api/v1/wallet/user-sub-1", () => {
  const { bodyHash, signature } = sign("test-secret-123", "1767225600", "GET", "/api/v1/wallet/user-sub-1", "");
  assert.equal(bodyHash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(signature, "v1=2b0726b5f46af3137ecc0e51e27183533e357d620e2ab128fd7165610bc9ca6f");
});
