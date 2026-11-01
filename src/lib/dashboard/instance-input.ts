import { randomBytes } from "node:crypto";

import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import {
  getGameDefinition,
  normalizeSettings,
  type GameDefinition,
  type SettingIssue,
  type SettingValues,
} from "@/lib/games/catalog";
import {
  normalizeMinecraftSource,
  validateMinecraftSourceIssues,
  type MinecraftSource,
} from "@/lib/games/minecraft-source";
import type { InstanceProfile } from "@/lib/games/profile";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import { getCloudflareConfig } from "@/lib/settings/store";
import { LocalizedError, type MessageValues } from "@/lib/i18n/errors";

/** Invalid user input (422); the text is translated by the route handler. */
export class InputError extends LocalizedError {
  constructor(key: string, values: MessageValues = {}) {
    super(key, values, 422);
    this.name = "InputError";
  }
}

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Invalid game settings; each issue names the field so the message can use its translated label. */
export class SettingsError extends InputError {
  constructor(
    readonly gameId: string,
    readonly issues: SettingIssue[]
  ) {
    super("settings");
    this.name = "SettingsError";
  }
}

export function randomSecret(length = 20): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "server"
  );
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db.select({ id: gameInstances.id }).from(gameInstances).where(eq(gameInstances.slug, slug)).limit(1);
  return Boolean(row);
}

export async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; await slugTaken(slug); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

export function validateName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2 || name.length > 60) throw new InputError("nameLength");
  return name;
}

export async function validateSubdomain(raw: unknown, instanceId?: number): Promise<string | null> {
  if (!(await getCloudflareConfig())) return null;
  const sub = String(raw ?? "").trim().toLowerCase();
  if (!sub) return null;
  if (!SUBDOMAIN_RE.test(sub)) throw new InputError("subdomainFormat");
  const [clash] = await db
    .select({ id: gameInstances.id })
    .from(gameInstances)
    .where(
      and(
        eq(gameInstances.subdomain, sub),
        isNull(gameInstances.archivedAt),
        instanceId ? ne(gameInstances.id, instanceId) : undefined
      )
    )
    .limit(1);
  if (clash) throw new InputError("subdomainTaken", { subdomain: sub });
  return sub;
}

export function validateIdleMinutes(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 24 * 60) throw new InputError("idleMinutes");
  return n;
}

export async function validateServerType(def: GameDefinition, serverType: unknown, region: unknown) {
  const options = await getHetznerOptions();
  const location = String(region ?? "");
  if (!options.locations.some((l) => l.name === location)) throw new InputError("unknownLocation");
  const type = options.serverTypes.find((t) => t.name === serverType);
  if (!type) throw new InputError("unknownServerType");
  if (!type.availableIn.includes(location)) {
    throw new InputError("serverTypeUnavailable", { type: type.name.toUpperCase(), location });
  }
  if (type.memoryGb < def.minRamGb) {
    throw new InputError("minRam", { game: def.label, gb: def.minRamGb });
  }
  return { serverType: type.name, region: location };
}

/** Normalises game settings and fills generated secrets. */
export function buildSettings(def: GameDefinition, input: unknown, previous?: SettingValues): SettingValues {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const { values, issues } = normalizeSettings(def, raw, previous);
  if (def.id === "valheim" && values.password && String(values.serverName).includes(String(values.password))) {
    issues.push({ code: "valheimPassword", field: "password" });
  }
  if (issues.length) throw new SettingsError(def.id, issues);
  for (const field of def.settings) {
    if (field.type === "password" && field.generate && !values[field.key]) values[field.key] = randomSecret(16);
  }
  return values;
}

export function buildMinecraftSource(input: unknown): MinecraftSource {
  const source = normalizeMinecraftSource(input);
  const issues = validateMinecraftSourceIssues(source);
  if (issues.length) throw new InputError(`minecraft.${issues[0]}`);
  return source;
}

export function requireDefinition(gameType: unknown): GameDefinition {
  const def = getGameDefinition(String(gameType ?? ""));
  if (!def) throw new InputError("unsupportedGame");
  return def;
}

/** Like `requireDefinition`, but only for games that can currently be created. */
export function requireCreatableDefinition(gameType: unknown): GameDefinition {
  const def = requireDefinition(gameType);
  if (!def.available) throw new InputError("gameUnavailable", { game: def.label });
  return def;
}

export function newProfile(def: GameDefinition, body: Record<string, unknown>): InstanceProfile {
  const volume = Math.round(Number(body.volumeSizeGb ?? def.defaultVolumeGb));
  if (!Number.isFinite(volume) || volume < def.minVolumeGb || volume > 2000) {
    throw new InputError("volumeSize", { min: def.minVolumeGb });
  }
  return {
    settings: buildSettings(def, body.settings),
    minecraft: def.id === "minecraft" ? buildMinecraftSource(body.minecraft) : undefined,
    volumeSizeGb: volume,
    secrets: { rconPassword: randomSecret(24) },
  };
}
