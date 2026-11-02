import assert from "node:assert/strict";
import test from "node:test";

import { log, redact } from "../src/lib/observability/logger";
import { routePattern } from "../src/lib/platform/http";

test("log meta: credential and contact keys are redacted, values masked", () => {
  const out = redact({
    secret: "s3cr3t",
    TRETU_APP_SECRET: "x",
    authorization: "Bot abc",
    email: "robin@example.com",
    nested: { token: "t", fine: "Bearer abcdefghijklmnop", url: "postgres://tretu_web:pw@localhost:5432/tretu_web" },
    error: "failed for robin@example.com with v1=" + "a".repeat(64),
    status: 403,
  }) as Record<string, unknown>;
  assert.equal(out.secret, "[redacted]");
  assert.equal(out.TRETU_APP_SECRET, "[redacted]");
  assert.equal(out.authorization, "[redacted]");
  assert.equal(out.email, "[redacted]");
  assert.deepEqual(out.nested, { token: "[redacted]", fine: "Bearer [redacted]", url: "postgres://***@localhost:5432/tretu_web" });
  assert.equal(out.error, "failed for [email] with v1=[redacted]");
  assert.equal(out.status, 403);
  assert.equal((redact("x".repeat(5000)) as string).length, 1001);
});

test("log() writes one JSON line without secrets", () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    log("error", "test.event", { password: "hunter2", task: "delivery" });
  } finally {
    console.error = original;
  }
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.message, "test.event");
  assert.equal(entry.task, "delivery");
  assert.ok(!lines[0].includes("hunter2"));
});

test("platform error logs carry the route pattern, not subs or usernames", () => {
  assert.equal(routePattern("/api/v1/users/0b9f1c2e-1111-4a5b-8c9d-123456789abc/friends"), "/api/v1/users/:id/friends");
  assert.equal(routePattern("/api/v1/wallet/abc/transactions"), "/api/v1/wallet/:id/transactions");
  assert.equal(routePattern("/api/v1/events"), "/api/v1/events");
});
