import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { DASHBOARD_SECRET_KEY } from "@/lib/env/server";

const PREFIX = "v1";

function key(): Buffer {
  return createHash("sha256").update(`tretu-dashboard:${DASHBOARD_SECRET_KEY}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [prefix, iv, tag, ct] = stored.split(":");
  if (prefix !== PREFIX || !iv || !tag || ct === undefined) throw new Error("Unbekanntes Secret-Format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
