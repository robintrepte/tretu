/**
 * Which services tretu.de/status checks: env `TRETU_STATUS_TARGETS_JSON` (JSON array of `{id, url, name?, host?}`),
 * by default the hosts of docs/ecosystem/CONTRACT.md §0. `[]` switches the checks off.
 * Read by the platform worker (checks) and by the page / `/api/status` (which services to list).
 */
import { z } from "zod";

import { log } from "@/lib/observability/logger";

export type StatusTarget = {
  /** Stable key in the database, e.g. `saga`. */
  id: string;
  /** Display name; known ids get it from {@link KNOWN_SERVICES}. */
  name: string;
  /** Host shown next to the name, e.g. `saga.tretu.de` (known ids: the public host, never the check URL's). */
  host: string;
  /** Health endpoint (contract §0). */
  url: string;
};

/** Names of the contract's services (the same in German and English). */
export const KNOWN_SERVICES: Record<string, { name: string; host: string }> = {
  "tretu-web": { name: "Website", host: "tretu.de" },
  auth: { name: "Tretu-Konto", host: "auth.tretu.de" },
  saga: { name: "Saga", host: "saga.tretu.de" },
  play: { name: "Play", host: "play.tretu.de" },
  hollowmere: { name: "Hollowmere", host: "hollowmere.tretu.de" },
  "mc-dashboard": { name: "Minecraft-Dashboard", host: "mc.tretu.de" },
};

/** Order and URLs used when TRETU_STATUS_TARGETS_JSON is not set (contract §0). */
const DEFAULT_TARGETS: { id: string; url: string }[] = [
  { id: "tretu-web", url: "https://tretu.de/api/health" },
  { id: "auth", url: "https://auth.tretu.de/api/health" },
  { id: "saga", url: "https://saga.tretu.de/api/health" },
  { id: "play", url: "https://play.tretu.de/api/health" },
  { id: "hollowmere", url: "https://hollowmere.tretu.de/api/health" },
  { id: "mc-dashboard", url: "https://mc.tretu.de/api/health" },
];

const MAX_TARGETS = 20;

const targetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "id: lowercase letters, digits and dashes"),
  url: z.url({ protocol: /^https?$/ }),
  name: z.string().trim().min(1).max(60).optional(),
  /** Shown instead of the URL's host (e.g. when checking via 127.0.0.1). */
  host: z.string().trim().min(1).max(100).optional(),
});

const targetsSchema = z
  .array(targetSchema)
  .max(MAX_TARGETS)
  .refine((list) => new Set(list.map((t) => t.id)).size === list.length, "duplicate id");

function toTarget(input: { id: string; url: string; name?: string; host?: string }): StatusTarget {
  const known = KNOWN_SERVICES[input.id];
  return {
    id: input.id,
    name: input.name ?? known?.name ?? input.id,
    host: input.host ?? known?.host ?? new URL(input.url).host,
    url: input.url,
  };
}

/**
 * Parses a TRETU_STATUS_TARGETS_JSON value. Empty/unset → the contract's hosts. Invalid → the contract's hosts
 * plus an error message (logged by {@link statusTargets}), so a typo never empties the public page.
 */
export function parseStatusTargets(raw: string | undefined): { targets: StatusTarget[]; error?: string } {
  const value = raw?.trim();
  if (!value) return { targets: DEFAULT_TARGETS.map(toTarget) };
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return { targets: DEFAULT_TARGETS.map(toTarget), error: "TRETU_STATUS_TARGETS_JSON is not valid JSON" };
  }
  const parsed = targetsSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      targets: DEFAULT_TARGETS.map(toTarget),
      error: `TRETU_STATUS_TARGETS_JSON is invalid: ${issue ? `${issue.path.join(".") || "value"}: ${issue.message}` : "unknown"}`,
    };
  }
  return { targets: parsed.data.map(toTarget) };
}

let warned: string | undefined;

/** The configured targets (logs a configuration error once per value). */
export function statusTargets(env: Record<string, string | undefined> = process.env): StatusTarget[] {
  const raw = env.TRETU_STATUS_TARGETS_JSON;
  const { targets, error } = parseStatusTargets(raw);
  if (error && warned !== raw) {
    warned = raw;
    log("error", "status.targets_invalid", { error });
  }
  return targets;
}
