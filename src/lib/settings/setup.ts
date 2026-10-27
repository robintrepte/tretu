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

/** MD5 fingerprint in the colon notation Hetzner uses. */
function md5Fingerprint(publicKey: string): string {
  const blob = Buffer.from(publicKey.trim().split(/\s+/)[1] ?? "", "base64");
  return (createHash("md5").update(blob).digest("hex").match(/.{2}/g) ?? []).join(":");
}

function ensureLocalSshKey() {
  const existing = getSshCredentials();
  if (existing) return existing;
  const pair = sshUtils.generateKeyPairSync("ed25519", { comment: "tretu-dashboard" });
  setSetting(SETTING_KEYS.sshPrivateKey, pair.private, { secret: true });
  setSetting(SETTING_KEYS.sshPublicKey, pair.public);
  return getSshCredentials()!;
}

/** Stores the Hetzner token and registers the dashboard's SSH key in the project. */
export async function connectHetzner(token: string, location?: string) {
  const trimmed = token.trim();
  if (trimmed.length < 20) throw new Error("Das sieht nicht nach einem Hetzner-API-Token aus.");
  await hetznerClient.verifyToken(trimmed);

  const ssh = ensureLocalSshKey();
  let keyId: number;
  try {
    keyId = (await hetznerClient.createSshKey(`tretu-dashboard-${Date.now().toString(36)}`, ssh.publicKey, trimmed)).id;
  } catch (error) {
    if (!(error instanceof HetznerApiError)) throw error;
    if (error.status === 403 || error.code === "forbidden") {
      throw new Error("Der Token hat nur Leserechte. Bitte in der Hetzner Console einen Token mit „Lesen & Schreiben“ erstellen.");
    }
    if (error.code !== "uniqueness_error") throw error;
    const found = await hetznerClient.findSshKeyByFingerprint(md5Fingerprint(ssh.publicKey), trimmed);
    if (!found) throw error;
    keyId = found.id;
  }

  setSetting(SETTING_KEYS.hetznerToken, trimmed, { secret: true });
  setSetting(SETTING_KEYS.hetznerSshKeyId, String(keyId));
  if (location) setSetting(SETTING_KEYS.hetznerLocation, location);
  await getHetznerOptions({ refresh: true });
}

export async function connectCloudflare(input: { token?: string; domain: string }) {
  const domain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error("Bitte eine gültige Domain angeben, z. B. tretu.de.");
  const token = input.token?.trim() || getCloudflareConfig()?.token;
  if (!token) throw new Error("Bitte einen Cloudflare-API-Token angeben.");

  const zoneId = await cloudflareClient.findZoneId(token, domain);
  await cloudflareClient.verifyDnsAccess(token, zoneId);
  setSetting(SETTING_KEYS.cloudflareToken, token, { secret: true });
  setSetting(SETTING_KEYS.cloudflareDomain, domain);
  setSetting(SETTING_KEYS.cloudflareZoneId, zoneId);
}

export function disconnectCloudflare() {
  setSetting(SETTING_KEYS.cloudflareToken, null);
  setSetting(SETTING_KEYS.cloudflareDomain, null);
  setSetting(SETTING_KEYS.cloudflareZoneId, null);
}

export async function connectCurseForge(apiKey: string) {
  const trimmed = apiKey.trim();
  const previous = getSetting(SETTING_KEYS.curseforgeApiKey);
  setSetting(SETTING_KEYS.curseforgeApiKey, trimmed, { secret: true });
  try {
    await searchCurseForgeModpacks("all the mods", 1);
  } catch (error) {
    setSetting(SETTING_KEYS.curseforgeApiKey, previous, { secret: true });
    throw new Error(`CurseForge-Key funktioniert nicht: ${(error as Error).message}`);
  }
}

export function disconnectCurseForge() {
  setSetting(SETTING_KEYS.curseforgeApiKey, null);
}
