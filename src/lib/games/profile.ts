import { defaultSettings, getGameDefinition, type SettingValues } from "@/lib/games/catalog";
import { normalizeMinecraftSource, type MinecraftSource } from "@/lib/games/minecraft-source";

/** Shape of `game_instances.config_profile`. */
export type InstanceProfile = {
  settings: SettingValues;
  minecraft?: MinecraftSource;
  /** Desired volume size for the first start (the volume row holds the real size afterwards). */
  volumeSizeGb?: number;
  /** Internal secrets (never shown in the UI). */
  secrets: { rconPassword?: string };
};

export function readProfile(gameType: string, raw: unknown): InstanceProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const def = getGameDefinition(gameType);
  const isCurrentShape = r.settings && typeof r.settings === "object";

  const settings: SettingValues = {
    ...(def ? defaultSettings(def) : {}),
    ...(isCurrentShape ? (r.settings as SettingValues) : {}),
  };
  const secrets = (r.secrets && typeof r.secrets === "object" ? r.secrets : {}) as InstanceProfile["secrets"];

  return {
    settings,
    minecraft: gameType === "minecraft" ? normalizeMinecraftSource(isCurrentShape ? r.minecraft : r) : undefined,
    volumeSizeGb: typeof r.volumeSizeGb === "number" ? r.volumeSizeGb : undefined,
    secrets,
  };
}
