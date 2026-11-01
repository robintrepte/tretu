import { createHash } from "node:crypto";

import { utils as sshUtils } from "ssh2";

import { cloudflareClient } from "@/lib/cloudflare/client";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import { HetznerApiError, hetznerClient } from "@/lib/hetzner/client";
import { searchCurseForgeModpacks } from "@/lib/minecraft/curseforge";
import {
  getCloudflareConfig,
  getSetting,
  getSshCredentials,
  SETTING_KEYS,
  setSetting,
} from "@/lib/settings/store";
import { LocalizedError } from "@/lib/i18n/errors";

/** MD5 fingerprint in the colon notation Hetzner uses. */
function md5Fingerprint(publicKey: string): string {
  const blob = Buffer.from(publicKey.trim().split(/\s+/)[1] ?? "", "base64");
  return (createHash("md5").update(blob).digest("hex").match(/.{2}/g) ?? []).join(":");
}

async function ensureLocalSshKey() {
  const existing = await getSshCredentials();
  if (existing) return existing;
  const pair = sshUtils.generateKeyPairSync("ed25519", { comment: "tretu-dashboard" });
  await setSetting(SETTING_KEYS.sshPrivateKey, pair.private, { secret: true });
  await setSetting(SETTING_KEYS.sshPublicKey, pair.public);
  return (await getSshCredentials())!;
}

/** Stores the Hetzner token and registers the dashboard's SSH key in the project. */
export async function connectHetzner(token: string, location?: string) {
  const trimmed = token.trim();
  if (trimmed.length < 20) throw new LocalizedError("hetznerTokenFormat");
  await hetznerClient.verifyToken(trimmed);

  const ssh = await ensureLocalSshKey();
  let keyId: number;
  try {
    keyId = (await hetznerClient.createSshKey(`tretu-dashboard-${Date.now().toString(36)}`, ssh.publicKey, trimmed)).id;
  } catch (error) {
    if (!(error instanceof HetznerApiError)) throw error;
    if (error.status === 403 || error.code === "forbidden") {
      throw new LocalizedError("hetznerTokenReadOnly");
    }
    if (error.code !== "uniqueness_error") throw error;
    const found = await hetznerClient.findSshKeyByFingerprint(md5Fingerprint(ssh.publicKey), trimmed);
    if (!found) throw error;
    keyId = found.id;
  }

  await setSetting(SETTING_KEYS.hetznerToken, trimmed, { secret: true });
  await setSetting(SETTING_KEYS.hetznerSshKeyId, String(keyId));
  if (location) await setSetting(SETTING_KEYS.hetznerLocation, location);
  await getHetznerOptions({ refresh: true });
}

export async function connectCloudflare(input: { token?: string; domain: string }) {
  const domain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new LocalizedError("domainFormat");
  const token = input.token?.trim() || (await getCloudflareConfig())?.token;
  if (!token) throw new LocalizedError("cloudflareTokenRequired");

  const zoneId = await cloudflareClient.findZoneId(token, domain);
  await cloudflareClient.verifyDnsAccess(token, zoneId);
  await setSetting(SETTING_KEYS.cloudflareToken, token, { secret: true });
  await setSetting(SETTING_KEYS.cloudflareDomain, domain);
  await setSetting(SETTING_KEYS.cloudflareZoneId, zoneId);
}

export async function disconnectCloudflare() {
  await setSetting(SETTING_KEYS.cloudflareToken, null);
  await setSetting(SETTING_KEYS.cloudflareDomain, null);
  await setSetting(SETTING_KEYS.cloudflareZoneId, null);
}

export async function connectCurseForge(apiKey: string) {
  const trimmed = apiKey.trim();
  const previous = await getSetting(SETTING_KEYS.curseforgeApiKey);
  await setSetting(SETTING_KEYS.curseforgeApiKey, trimmed, { secret: true });
  try {
    await searchCurseForgeModpacks("all the mods", 1);
  } catch (error) {
    await setSetting(SETTING_KEYS.curseforgeApiKey, previous, { secret: true });
    throw new LocalizedError("curseforgeKeyInvalid", { detail: (error as Error).message });
  }
}

export async function disconnectCurseForge() {
  await setSetting(SETTING_KEYS.curseforgeApiKey, null);
}
