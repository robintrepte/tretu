import assert from "node:assert/strict";
import test from "node:test";

import { instanceActionSchema } from "../src/lib/validation/dashboard";

test("instance action schema accepts start action", () => {
  const parsed = instanceActionSchema.safeParse({
    actionType: "start",
    payload: {},
    idempotencyKey: "start-key-123",
  });
  assert.equal(parsed.success, true);
});
