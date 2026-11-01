/**
 * Tiny ICU-subset message formatter (works on server and client). Supports `{name}`,
 * `{n, number}`, `{n, plural, =0 {…} one {# …} other {# …}}` and `{x, select, a {…} other {…}}`.
 * The message JSON (messages/platform/{de,en}.json) stays next-intl compatible.
 */
import de from "../../../messages/platform/de.json";
import en from "../../../messages/platform/en.json";

export type PlatformLocale = "de" | "en";
export const PLATFORM_LOCALES: readonly PlatformLocale[] = ["de", "en"];
export const DEFAULT_LOCALE: PlatformLocale = "de";
export type Messages = typeof de;
export type Values = Record<string, string | number | null | undefined>;

export const MESSAGES: Record<PlatformLocale, Messages> = { de, en: en as Messages };

export function normalizeLocale(value: string | null | undefined): PlatformLocale {
  return value === "en" ? "en" : "de";
}

function findClosing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

function parseOptions(text: string): Map<string, string> {
  const options = new Map<string, string>();
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    const start = i;
    while (i < text.length && text[i] !== "{" && !/\s/.test(text[i])) i++;
    const selector = text.slice(start, i);
    while (i < text.length && text[i] !== "{") i++;
    if (i >= text.length) break;
    const end = findClosing(text, i);
    options.set(selector, text.slice(i + 1, end));
    i = end + 1;
  }
  return options;
}

function replaceHash(text: string, value: string): string {
  let out = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    out += ch === "#" && depth === 0 ? value : ch;
  }
  return out;
}

export function formatMessage(message: string, values: Values = {}, locale: PlatformLocale = DEFAULT_LOCALE): string {
  let out = "";
  let i = 0;
  while (i < message.length) {
    const ch = message[i];
    if (ch !== "{") {
      out += ch;
      i++;
      continue;
    }
    const end = findClosing(message, i);
    out += formatArgument(message.slice(i + 1, end), values, locale);
    i = end + 1;
  }
  return out;
}

function formatArgument(inner: string, values: Values, locale: PlatformLocale): string {
  const firstComma = inner.indexOf(",");
  if (firstComma < 0) {
    const value = values[inner.trim()];
    return value === undefined || value === null ? "" : String(value);
  }
  const name = inner.slice(0, firstComma).trim();
  const rest = inner.slice(firstComma + 1);
  const secondComma = rest.indexOf(",");
  const type = (secondComma < 0 ? rest : rest.slice(0, secondComma)).trim();
  const raw = values[name];
  if (type === "number") {
    return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB").format(Number(raw ?? 0));
  }
  const options = parseOptions(secondComma < 0 ? "" : rest.slice(secondComma + 1));
  if (type === "plural") {
    const n = Number(raw ?? 0);
    const exact = options.get(`=${n}`);
    const category = new Intl.PluralRules(locale).select(n);
    const chosen = exact ?? options.get(category) ?? options.get("other") ?? "";
    const formatted = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB").format(n);
    return formatMessage(replaceHash(chosen, formatted), values, locale);
  }
  if (type === "select") {
    const chosen = options.get(String(raw ?? "")) ?? options.get("other") ?? "";
    return formatMessage(chosen, values, locale);
  }
  return raw === undefined || raw === null ? "" : String(raw);
}

function lookup(messages: unknown, key: string): string | undefined {
  let current: unknown = messages;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export type Translator = (key: string, values?: Values) => string;

export function createTranslator(locale: PlatformLocale, namespace?: string): Translator {
  const messages = MESSAGES[locale];
  return (key, values) => {
    const full = namespace ? `${namespace}.${key}` : key;
    const message = lookup(messages, full) ?? lookup(MESSAGES.de, full);
    return message === undefined ? full : formatMessage(message, values, locale);
  };
}

/** Server-side translation for a given user locale (notification texts). */
export function translate(locale: string | null | undefined, key: string, values?: Values): string {
  return createTranslator(normalizeLocale(locale))(key, values);
}
