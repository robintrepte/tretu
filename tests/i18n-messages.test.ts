import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { loadMessages, mergeMessages } from "../src/i18n/messages";

const FIXTURES = path.join(__dirname, "fixtures", "messages");

test("namespaced message files are merged under their folder name", () => {
  const de = loadMessages("de", FIXTURES);
  assert.deepEqual(de.fixture, { title: "Fixture-Titel", count: "{n} Dinge" });
  assert.equal((de.common as Record<string, string>).hello, "Hallo");
  assert.equal("empty" in de, false, "folders without a file for the locale are skipped");
});

test("English falls back to German for missing keys and namespaces", () => {
  const en = loadMessages("en", FIXTURES);
  assert.equal((en.common as Record<string, string>).hello, "Hello");
  assert.equal((en.common as Record<string, string>).only, "Nur Deutsch");
  assert.deepEqual(en.fixture, { title: "Fixture title", count: "{n} Dinge" });
  assert.deepEqual(en.nested, { a: { b: "B" } });
});

test("deep merge keeps base keys", () => {
  assert.deepEqual(mergeMessages({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3 }, c: 4 }), { a: { x: 1, y: 3 }, b: 1, c: 4 });
});

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

test("the app's German and English messages have the same keys (games: English overlay only)", () => {
  const read = (locale: string) => JSON.parse(readFileSync(path.join(__dirname, "..", "messages", `${locale}.json`), "utf8"));
  const de = new Set(keys(read("de")).filter((k) => !k.startsWith("games")));
  const en = new Set(keys(read("en")).filter((k) => !k.startsWith("games")));
  assert.deepEqual([...de].filter((k) => !en.has(k)), []);
  assert.deepEqual([...en].filter((k) => !de.has(k)), []);
});
