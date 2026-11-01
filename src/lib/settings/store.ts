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

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(dashboardSettings).where(eq(dashboardSettings.key, key)).limit(1);
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

export async function setSetting(key: SettingKey, value: string | null, opts?: { secret?: boolean }): Promise<void> {
  if (value === null || value === "") {
    await db.delete(dashboardSettings).where(eq(dashboardSettings.key, key));
    return;
  }
  const secret = Boolean(opts?.secret);
  const stored = secret ? encryptSecret(value) : value;
  await db
    .insert(dashboardSettings)
    .values({ key, value: stored, encrypted: secret, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: dashboardSettings.key,
      set: { value: stored, encrypted: secret, updatedAt: new Date() },
    });
}

export async function getJsonSetting<T>(key: SettingKey): Promise<T | null> {
  const raw = await getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJsonSetting(key: SettingKey, value: unknown): Promise<void> {
  await setSetting(key, JSON.stringify(value));
}

export async function getHetznerToken(): Promise<string> {
  return (await getSetting(SETTING_KEYS.hetznerToken)) ?? HETZNER_API_TOKEN;
}

export async function getDefaultLocation(): Promise<string> {
  return (await getSetting(SETTING_KEYS.hetznerLocation)) ?? HETZNER_DEFAULT_REGION;
}

export async function getCurseForgeApiKey(): Promise<string> {
  return (await getSetting(SETTING_KEYS.curseforgeApiKey)) ?? CURSEFORGE_API_KEY;
}

export type CloudflareConfig = { token: string; zoneId: string; domain: string };

export async function getCloudflareConfig(): Promise<CloudflareConfig | null> {
  const token = (await getSetting(SETTING_KEYS.cloudflareToken)) ?? CLOUDFLARE_API_TOKEN;
  const domain = (await getSetting(SETTING_KEYS.cloudflareDomain)) ?? CLOUDFLARE_DOMAIN;
  const zoneId = (await getSetting(SETTING_KEYS.cloudflareZoneId)) ?? "";
  if (!token || !domain) return null;
  return { token, domain, zoneId };
}

export type SshCredentials = { privateKey: string; publicKey: string; hetznerKeyId: number | null };

export async function getSshCredentials(): Promise<SshCredentials | null> {
  const privateKey = await getSetting(SETTING_KEYS.sshPrivateKey);
  const publicKey = await getSetting(SETTING_KEYS.sshPublicKey);
  if (!privateKey || !publicKey) return null;
  const id = Number(await getSetting(SETTING_KEYS.hetznerSshKeyId));
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

export async function getSetupStatus(): Promise<SetupStatus> {
  const hetzner = Boolean(await getHetznerToken());
  const ssh = await getSshCredentials();
  const sshKey = Boolean(ssh?.hetznerKeyId);
  return {
    hetzner,
    sshKey,
    cloudflare: Boolean((await getCloudflareConfig())?.zoneId),
    curseforge: Boolean(await getCurseForgeApiKey()),
    ready: hetzner && sshKey,
  };
}

export type SetupSnapshot = {
  status: SetupStatus;
  defaultLocation: string;
  cloudflareDomain: string | null;
  sshPublicKey: string | null;
};

/** Everything the setup page shows (no secrets). */
export async function getSetupSnapshot(): Promise<SetupSnapshot> {
  const [status, defaultLocation, cf, ssh] = await Promise.all([
    getSetupStatus(),
    getDefaultLocation(),
    getCloudflareConfig(),
    getSshCredentials(),
  ]);
  return { status, defaultLocation, cloudflareDomain: cf?.domain ?? null, sshPublicKey: ssh?.publicKey ?? null };
}
