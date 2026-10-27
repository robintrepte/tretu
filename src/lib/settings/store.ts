import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dashboardSettings } from "@/db/schema";
import {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_DOMAIN,
  CURSEFORGE_API_KEY,
  HETZNER_API_TOKEN,
  HETZNER_DEFAULT_REGION,
} from "@/lib/env/server";
import { log } from "@/lib/observability/logger";
import { decryptSecret, encryptSecret } from "@/lib/settings/crypto";

export const SETTING_KEYS = {
  hetznerToken: "hetzner.token",
  hetznerLocation: "hetzner.location",
  hetznerSshKeyId: "hetzner.sshKeyId",
  sshPrivateKey: "ssh.privateKey",
  sshPublicKey: "ssh.publicKey",
  cloudflareToken: "cloudflare.token",
  cloudflareZoneId: "cloudflare.zoneId",
  cloudflareDomain: "cloudflare.domain",
  curseforgeApiKey: "curseforge.apiKey",
} as const;

type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS] | `cache.${string}` | `worker.${string}`;

export function getSetting(key: SettingKey): string | null {
  const row = db.select().from(dashboardSettings).where(eq(dashboardSettings.key, key)).get();
  if (!row) return null;
  if (!row.encrypted) return row.value;
  try {
    return decryptSecret(row.value);
  } catch (error) {
    log("error", "settings.decrypt_failed", {
      key,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export function setSetting(key: SettingKey, value: string | null, opts?: { secret?: boolean }): void {
  if (value === null || value === "") {
    db.delete(dashboardSettings).where(eq(dashboardSettings.key, key)).run();
    return;
  }
  const secret = Boolean(opts?.secret);
  const stored = secret ? encryptSecret(value) : value;
  db.insert(dashboardSettings)
    .values({ key, value: stored, encrypted: secret, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: dashboardSettings.key,
      set: { value: stored, encrypted: secret, updatedAt: new Date() },
    })
    .run();
}

export function getJsonSetting<T>(key: SettingKey): T | null {
  const raw = getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJsonSetting(key: SettingKey, value: unknown): void {
  setSetting(key, JSON.stringify(value));
}

export function getHetznerToken(): string {
  return getSetting(SETTING_KEYS.hetznerToken) ?? HETZNER_API_TOKEN;
}

export function getDefaultLocation(): string {
  return getSetting(SETTING_KEYS.hetznerLocation) ?? HETZNER_DEFAULT_REGION;
}

export function getCurseForgeApiKey(): string {
  return getSetting(SETTING_KEYS.curseforgeApiKey) ?? CURSEFORGE_API_KEY;
}

export type CloudflareConfig = { token: string; zoneId: string; domain: string };

export function getCloudflareConfig(): CloudflareConfig | null {
  const token = getSetting(SETTING_KEYS.cloudflareToken) ?? CLOUDFLARE_API_TOKEN;
  const domain = getSetting(SETTING_KEYS.cloudflareDomain) ?? CLOUDFLARE_DOMAIN;
  const zoneId = getSetting(SETTING_KEYS.cloudflareZoneId) ?? "";
  if (!token || !domain) return null;
  return { token, domain, zoneId };
}

export type SshCredentials = { privateKey: string; publicKey: string; hetznerKeyId: number | null };

export function getSshCredentials(): SshCredentials | null {
  const privateKey = getSetting(SETTING_KEYS.sshPrivateKey);
  const publicKey = getSetting(SETTING_KEYS.sshPublicKey);
  if (!privateKey || !publicKey) return null;
  const id = Number(getSetting(SETTING_KEYS.hetznerSshKeyId));
  return { privateKey, publicKey, hetznerKeyId: Number.isFinite(id) && id > 0 ? id : null };
}

export type SetupStatus = {
  hetzner: boolean;
  sshKey: boolean;
  cloudflare: boolean;
  curseforge: boolean;
  /** Everything needed to create and start servers. */
  ready: boolean;
};

export function getSetupStatus(): SetupStatus {
  const hetzner = Boolean(getHetznerToken());
  const ssh = getSshCredentials();
  const sshKey = Boolean(ssh?.hetznerKeyId);
  return {
    hetzner,
    sshKey,
    cloudflare: Boolean(getCloudflareConfig()?.zoneId),
    curseforge: Boolean(getCurseForgeApiKey()),
    ready: hetzner && sshKey,
  };
}
