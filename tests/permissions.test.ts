import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_PERMISSIONS } from "../src/lib/permissions/model";

test("manager can start instances", () => {
  assert.equal(ROLE_PERMISSIONS.manager.has("instances:start"), true);
});

test("manager cannot delete host", () => {
  assert.equal(ROLE_PERMISSIONS.manager.has("instances:delete-host"), false);
});
