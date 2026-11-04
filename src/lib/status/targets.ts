/**
 * Which services tretu.de/status checks. Read by the platform worker (checks) and by the page / `/api/status`
 * (which services to list):
 * - web services: env `TRETU_STATUS_TARGETS_JSON` (JSON array of `{id, url, name?, host?, …options}`), by default the
 *   hosts of docs/ecosystem/CONTRACT.md §0; `[]` switches them off;
 * - the Minecraft server: env `TRETU_STATUS_MINECRAFT` (`host[:port]`, default `mc.tretu.de:25565`, `off`, or a JSON
 *   object `{address?, …options}`);
 * - the TeamSpeak server: via ServerQuery when `TS_QUERY_*` is set, else a TCP check of `TRETU_STATUS_TEAMSPEAK`
 *   (`host:port`, or a JSON object `{address?, …options}`); no row when neither is configured.
 *
 * Options of every service: `excludeFromOverall: true` (shown, but never changes the overall status) and
 * `maintenance: true | "<note>"` with an optional `until` (ISO time with offset): shown as "Wartung", left out of the
 * overall status and no Discord alerts until `until` has passed (or the option is removed).
 */
import { z } from "zod";

import { log } from "@/lib/observability/logger";

export type Address = { host: string; port: number };

/** Planned maintenance of a service (from the configuration). */
export type Maintenance = {
  /** Shown on the page, e.g. "Umzug auf einen neuen Server". */
  note: string | null;
  /** ISO time the maintenance ends by itself; null = until the option is removed. */
  until: string | null;
};

export type TargetOptions = {
  /** Shown, but never part of the overall status. */
  excludeFromOverall: boolean;
  maintenance: Maintenance | null;
};

type TargetBase = TargetOptions & {
  /** Stable key in the database, e.g. `saga`. */
  id: string;
  /** Display name; known ids get it from {@link KNOWN_SERVICES}. */
  name: string;
  /** Host shown next to the name, e.g. `saga.tretu.de` (known ids: the public host, never the check URL's). */
  host: string;
};

/** Whether the maintenance is in effect at `now` (configured and `until` not passed). */
export function maintenanceActive(maintenance: Maintenance | null | undefined, now: Date = new Date()): boolean {
  if (!maintenance) return false;
  return maintenance.until === null || now.getTime() < Date.parse(maintenance.until);
}

/** A web service: `GET <url>` (contract §0 `/api/health`). */
export type HttpTarget = TargetBase & { kind: "http"; url: string };
/** The Minecraft server: Server List Ping. */
export type MinecraftTarget = TargetBase & { kind: "minecraft"; address: Address };
/** The TeamSpeak server: ServerQuery (`TS_QUERY_*`) or a plain TCP connect to `address`. */
export type TeamspeakTarget = TargetBase & { kind: "teamspeak"; mode: "query" | "tcp"; address: Address | null };

export type StatusTarget = HttpTarget | MinecraftTarget | TeamspeakTarget;

export const MINECRAFT_DEFAULT = "mc.tretu.de:25565";

/** Names of the contract's services (the same in German and English). */
export const KNOWN_SERVICES: Record<string, { name: string; host: string }> = {
  "tretu-web": { name: "Website", host: "tretu.de" },
  auth: { name: "Tretu-Konto", host: "auth.tretu.de" },
  saga: { name: "Saga", host: "saga.tretu.de" },
  play: { name: "Play", host: "play.tretu.de" },
  hollowmere: { name: "Hollowmere", host: "hollowmere.tretu.de" },
  "mc-dashboard": { name: "Minecraft-Dashboard", host: "mc.tretu.de" },
  city: { name: "Tretu City", host: "city.tretu.de" },
};

/** Order and URLs used when TRETU_STATUS_TARGETS_JSON is not set (contract §0). */
const DEFAULT_TARGETS: { id: string; url: string }[] = [
  { id: "tretu-web", url: "https://tretu.de/api/health" },
  { id: "auth", url: "https://auth.tretu.de/api/health" },
  { id: "saga", url: "https://saga.tretu.de/api/health" },
  { id: "play", url: "https://play.tretu.de/api/health" },
  { id: "hollowmere", url: "https://hollowmere.tretu.de/api/health" },
  { id: "mc-dashboard", url: "https://mc.tretu.de/api/health" },
  { id: "city", url: "https://city.tretu.de/api/health" },
];

const MAX_TARGETS = 20;

const optionsSchema = z.object({
  excludeFromOverall: z.boolean().optional(),
  /** `true` or a note shown on the page; `false` = no maintenance. */
  maintenance: z.union([z.boolean(), z.string().trim().min(1).max(300)]).optional(),
  /** End of the maintenance, ISO 8601 with offset (e.g. `2026-11-05T18:00:00+01:00`). */
  until: z.iso.datetime({ offset: true }).optional(),
});
type OptionsInput = z.infer<typeof optionsSchema>;

function toOptions(input: OptionsInput): TargetOptions {
  const m = input.maintenance;
  const until = input.until ? new Date(input.until).toISOString() : null;
  return {
    excludeFromOverall: input.excludeFromOverall ?? false,
    maintenance: m === true ? { note: null, until } : typeof m === "string" ? { note: m, until } : null,
  };
}

const NO_OPTIONS: TargetOptions = { excludeFromOverall: false, maintenance: null };

const targetSchema = optionsSchema.extend({
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

function toTarget(input: { id: string; url: string; name?: string; host?: string } & OptionsInput): HttpTarget {
  const known = KNOWN_SERVICES[input.id];
  return {
    ...toOptions(input),
    kind: "http",
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
export function parseStatusTargets(raw: string | undefined): { targets: HttpTarget[]; error?: string } {
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

/** `host`, `host:port` or `[v6]:port` → address; null when invalid. */
export function parseAddress(raw: string, defaultPort: number): Address | null {
  const value = raw.trim();
  const m = /^(?:\[([0-9a-fA-F:.]+)\]|([A-Za-z0-9.-]+))(?::(\d{1,5}))?$/.exec(value);
  if (!m) return null;
  const port = m[3] ? Number(m[3]) : defaultPort;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: (m[1] ?? m[2])!, port };
}

type Env = Record<string, string | undefined>;

const gameServerSchema = optionsSchema.extend({ address: z.string().trim().min(1).max(200).optional() });

/**
 * A game server variable: `host[:port]` or a JSON object `{address?, excludeFromOverall?, maintenance?, until?}`.
 * Returns the address text (undefined = not given) and the options, or an error.
 */
function parseGameServerEnv(name: string, raw: string): { address?: string; options: TargetOptions; error?: string } {
  if (!raw.startsWith("{")) return { address: raw, options: NO_OPTIONS };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { options: NO_OPTIONS, error: `${name} is not valid JSON` };
  }
  const parsed = gameServerSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { options: NO_OPTIONS, error: `${name} is invalid: ${issue ? `${issue.path.join(".") || "value"}: ${issue.message}` : "unknown"}` };
  }
  return { address: parsed.data.address, options: toOptions(parsed.data) };
}

/** The Minecraft server row (default mc.tretu.de:25565, `off` = none). */
export function minecraftTarget(env: Env): { target: MinecraftTarget | null; error?: string } {
  const value = env.TRETU_STATUS_MINECRAFT?.trim() || MINECRAFT_DEFAULT;
  if (value.toLowerCase() === "off") return { target: null };
  const parsed = parseGameServerEnv("TRETU_STATUS_MINECRAFT", value);
  const raw = parsed.error ? MINECRAFT_DEFAULT : (parsed.address ?? MINECRAFT_DEFAULT);
  const address = parseAddress(raw, 25565);
  if (!address) return { target: null, error: "TRETU_STATUS_MINECRAFT must be host[:port], off or a JSON object" };
  return { target: { ...parsed.options, kind: "minecraft", id: "minecraft", name: "Minecraft-Server", host: address.host, address }, error: parsed.error };
}

/** The TeamSpeak row: ServerQuery when `TS_QUERY_*` is set, else TCP to `TRETU_STATUS_TEAMSPEAK`, else none. */
export function teamspeakTarget(env: Env): { target: TeamspeakTarget | null; error?: string } {
  const value = env.TRETU_STATUS_TEAMSPEAK?.trim();
  const parsed = value ? parseGameServerEnv("TRETU_STATUS_TEAMSPEAK", value) : { options: NO_OPTIONS };
  const raw = parsed.address;
  const address = raw ? parseAddress(raw, 30033) : null;
  const error = parsed.error ?? (raw && !address ? "TRETU_STATUS_TEAMSPEAK must be host:port or a JSON object" : undefined);
  const query = Boolean(env.TS_QUERY_HOST && env.TS_QUERY_USER && env.TS_QUERY_PASSWORD);
  if (!query && !address) return { target: null, error };
  return {
    target: {
      ...parsed.options,
      kind: "teamspeak",
      id: "teamspeak",
      name: "TeamSpeak",
      host: address?.host ?? "tretu.de",
      mode: query ? "query" : "tcp",
      address,
    },
    error,
  };
}

const warned = new Set<string>();

/** Every configured target, web services first (logs each configuration error once). */
export function statusTargets(env: Env = process.env): StatusTarget[] {
  const http = parseStatusTargets(env.TRETU_STATUS_TARGETS_JSON);
  const minecraft = minecraftTarget(env);
  const teamspeak = teamspeakTarget(env);
  for (const error of [http.error, minecraft.error, teamspeak.error]) {
    if (error && !warned.has(error)) {
      warned.add(error);
      log("error", "status.targets_invalid", { error });
    }
  }
  return [...http.targets, ...(minecraft.target ? [minecraft.target] : []), ...(teamspeak.target ? [teamspeak.target] : [])];
}
