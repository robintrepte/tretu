import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTsUuid, unescapeTsQueryString } from "../src/lib/teamspeak/query-escape";

test("unescapeTsQueryString decodes TS query nicknames", () => {
  assert.equal(unescapeTsQueryString("Ewrany\\s\\p\\sElias"), "Ewrany | Elias");
  assert.equal(unescapeTsQueryString("iNibori\\s\\/\\sRobin"), "iNibori / Robin");
});

test("normalizeTsUuid collapses escaped slashes", () => {
  const canonical = "kXEhuUoIHH0+E/CoZSx/4eI01UM=";
  assert.equal(normalizeTsUuid(canonical), canonical);
  assert.equal(normalizeTsUuid("kXEhuUoIHH0+E\\/CoZSx\\/4eI01UM="), canonical);
});
