import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

export type Messages = Record<string, unknown>;

const DEFAULT_DIR = path.join(process.cwd(), "messages");
const cache = new Map<string, Messages>();

function readJson(file: string): Messages {
  try {
    const parsed: unknown = JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Messages) : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Invalid message file ${file}: ${(error as Error).message}`);
  }
}

function isObject(value: unknown): value is Messages {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Deep merge: values from `override` win, nested objects are merged. */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isObject(value) && isObject(out[key]) ? mergeMessages(out[key], value) : value;
  }
  return out;
}

/**
 * Messages for one locale: `messages/<locale>.json` plus every `messages/<namespace>/<locale>.json`
 * under the key `<namespace>` (e.g. `messages/platform/de.json` → `t("platform.…")`).
 * Missing keys fall back to German, so a half-translated namespace never breaks a page.
 */
export function loadMessages(locale: Locale, dir: string = DEFAULT_DIR): Messages {
  const cacheKey = `${dir}\u0000${locale}`;
  const cached = process.env.NODE_ENV === "production" ? cache.get(cacheKey) : undefined;
  if (cached) return cached;

  const load = (l: Locale): Messages => {
    let messages = readJson(path.join(dir, `${l}.json`));
    let entries: string[] = [];
    try {
      // Read at runtime from the checkout (`next start`, not standalone): keep the bundler from tracing the whole project.
      entries = readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      entries = [];
    }
    for (const namespace of entries) {
      const namespaced = readJson(path.join(dir, namespace, `${l}.json`));
      if (Object.keys(namespaced).length === 0) continue;
      messages = mergeMessages(messages, { [namespace]: namespaced });
    }
    return messages;
  };

  const messages = locale === DEFAULT_LOCALE ? load(locale) : mergeMessages(load(DEFAULT_LOCALE), load(locale));
  cache.set(cacheKey, messages);
  return messages;
}
