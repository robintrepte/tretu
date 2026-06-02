import { z } from "zod";

export const gameTypeSchema = z.enum([
  "minecraft",
  "ark",
  "satisfactory",
  "spaceengineers",
  "cs2",
  "arma3",
  "arma2",
  "teamspeak",
]);

export const instanceCreateSchema = z.object({
  slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(3).max(120),
  gameType: gameTypeSchema,
  region: z.string().default("fsn1"),
  desiredState: z.enum(["offline", "running"]).default("offline"),
  activeServerType: z.string().min(3).max(50),
  configProfile: z.record(z.string(), z.unknown()).default({}),
  idleDeleteAfterMinutes: z.number().int().min(0).max(10080).default(120),
  /** Hetzner volume size (GB); host is created only on start/provision, volume always on instance create. */
  volumeSizeGb: z.number().int().min(10).max(10240).optional(),
});

export const instanceUpdateSchema = instanceCreateSchema.partial();

export const actionTypeSchema = z.enum([
  "createVolume",
  "provision",
  "start",
  "stop",
  "restart",
  "deleteHost",
  "backup",
  "restore",
  "updateConfig",
  "updateVersion",
  "syncMods",
]);

export const instanceActionSchema = z.object({
  actionType: actionTypeSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(8).max(120),
});
