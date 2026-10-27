import { randomBytes } from "node:crypto";

import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { getGameDefinition, normalizeSettings, type GameDefinition, type SettingValues } from "@/lib/games/catalog";
import {
  normalizeMinecraftSource,
  validateMinecraftSource,
  type MinecraftSource,
} from "@/lib/games/minecraft-source";
import type { InstanceProfile } from "@/lib/games/profile";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import { getCloudflareConfig } from "@/lib/settings/store";

export class InputError extends Error {}

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

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

export function uniqueSlug(base: string): string {
  let slug = base;
  for (let i = 2; db.select({ id: gameInstances.id }).from(gameInstances).where(eq(gameInstances.slug, slug)).get(); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

export function validateName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2 || name.length > 60) throw new InputError("Der Name muss 2–60 Zeichen lang sein.");
  return name;
}

export function validateSubdomain(raw: unknown, instanceId?: number): string | null {
  if (!getCloudflareConfig()) return null;
  const sub = String(raw ?? "").trim().toLowerCase();
  if (!sub) return null;
  if (!SUBDOMAIN_RE.test(sub)) throw new InputError("Subdomain: nur Kleinbuchstaben, Zahlen und Bindestriche.");
  const clash = db
    .select({ id: gameInstances.id })
    .from(gameInstances)
    .where(
      and(
        eq(gameInstances.subdomain, sub),
        isNull(gameInstances.archivedAt),
        instanceId ? ne(gameInstances.id, instanceId) : undefined
      )
    )
    .get();
  if (clash) throw new InputError(`Die Subdomain „${sub}“ wird schon von einem anderen Server genutzt.`);
  return sub;
}

export function validateIdleMinutes(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 24 * 60) throw new InputError("Leerlaufzeit: 0 (nie) bis 1440 Minuten.");
  return n;
}

export async function validateServerType(def: GameDefinition, serverType: unknown, region: unknown) {
  const options = await getHetznerOptions();
  const location = String(region ?? "");
  if (!options.locations.some((l) => l.name === location)) throw new InputError("Unbekannter Standort.");
  const type = options.serverTypes.find((t) => t.name === serverType);
  if (!type) throw new InputError("Unbekannter Servertyp.");
  if (!type.availableIn.includes(location)) {
    throw new InputError(`${type.name.toUpperCase()} ist in ${location} gerade nicht verfügbar.`);
  }
  if (type.memoryGb < def.minRamGb) {
    throw new InputError(`${def.label} braucht mindestens ${def.minRamGb} GB RAM.`);
  }
  return { serverType: type.name, region: location };
}

/** Normalises game settings and fills generated secrets. */
export function buildSettings(def: GameDefinition, input: unknown, previous?: SettingValues): SettingValues {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const { values, errors } = normalizeSettings(def, raw, previous);
  if (def.id === "valheim" && values.password && String(values.serverName).includes(String(values.password))) {
    errors.push("Valheim: Das Passwort darf nicht im Servernamen vorkommen.");
  }
  if (errors.length) throw new InputError(errors.join(" "));
  for (const field of def.settings) {
    if (field.type === "password" && field.generate && !values[field.key]) values[field.key] = randomSecret(16);
  }
  return values;
}

export function buildMinecraftSource(input: unknown): MinecraftSource {
  const source = normalizeMinecraftSource(input);
  const errors = validateMinecraftSource(source);
  if (errors.length) throw new InputError(errors.join(" "));
  return source;
}

export function requireDefinition(gameType: unknown): GameDefinition {
  const def = getGameDefinition(String(gameType ?? ""));
  if (!def) throw new InputError("Dieses Spiel wird nicht unterstützt.");
  return def;
}

export function newProfile(def: GameDefinition, body: Record<string, unknown>): InstanceProfile {
  const volume = Math.round(Number(body.volumeSizeGb ?? def.defaultVolumeGb));
  if (!Number.isFinite(volume) || volume < def.minVolumeGb || volume > 2000) {
    throw new InputError(`Speicher: ${def.minVolumeGb}–2000 GB.`);
  }
  return {
    settings: buildSettings(def, body.settings),
    minecraft: def.id === "minecraft" ? buildMinecraftSource(body.minecraft) : undefined,
    volumeSizeGb: volume,
    secrets: { rconPassword: randomSecret(24) },
  };
}
