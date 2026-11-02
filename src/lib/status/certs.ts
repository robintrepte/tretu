/**
 * Certificate expiry warnings: once an hour the platform worker reads the TLS certificate of every HTTPS status
 * target (plus `TRETU_STATUS_CERT_HOSTS`) and posts to the status Discord webhook 14 and 3 days before it
 * expires, once per threshold and certificate (a renewed certificate starts over). Without the webhook nothing
 * is read: the warning is the only purpose.
 */
import { isIP } from "node:net";
import tls from "node:tls";

import { eq } from "drizzle-orm";

import { platformStatusCerts } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import type { Executor } from "@/lib/platform/db";
import { discordWebhookUrl, postDiscord } from "@/lib/status/alerts";
import { CHECK_TIMEOUT_MS } from "@/lib/status/check";
import { STATUS_TIME_ZONE } from "@/lib/status/store";
import { parseAddress, type Address, type StatusTarget } from "@/lib/status/targets";

export const CERT_CHECK_EVERY_MS = 3600_000;
/** Days before expiry at which a warning is posted (largest first). */
export const CERT_WARN_DAYS = [14, 3] as const;
const DAY_MS = 24 * 3600_000;

/** `host` for port 443, else `host:port`. */
export function endpointLabel(address: Address): string {
  return address.port === 443 ? address.host : `${address.host}:${address.port}`;
}

/** HTTPS targets and `TRETU_STATUS_CERT_HOSTS` (comma-separated `host[:port]`), without duplicates. */
export function certEndpoints(targets: StatusTarget[], env: Record<string, string | undefined> = process.env): Address[] {
  const out = new Map<string, Address>();
  for (const target of targets) {
    if (target.kind !== "http") continue;
    const url = new URL(target.url);
    if (url.protocol !== "https:") continue;
    const address = { host: url.hostname.replace(/^\[|\]$/g, ""), port: url.port ? Number(url.port) : 443 };
    out.set(endpointLabel(address), address);
  }
  for (const raw of (env.TRETU_STATUS_CERT_HOSTS ?? "").split(",")) {
    if (!raw.trim()) continue;
    const address = parseAddress(raw, 443);
    if (address) out.set(endpointLabel(address), address);
    else log("error", "status.cert_host_invalid", { value: raw.trim().slice(0, 100) });
  }
  return [...out.values()];
}

export type CertInfo = { validTo: Date; fingerprint: string };

/** Reads the certificate the server presents (not validated: an invalid one must be reported too). */
export function readCertificate(address: Address, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<CertInfo | null> {
  return new Promise((resolve) => {
    let finished = false;
    const socket = tls.connect({
      host: address.host,
      port: address.port,
      servername: isIP(address.host) ? undefined : address.host,
      rejectUnauthorized: false,
    });
    const done = (value: CertInfo | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      socket.destroy();
      resolve(value);
    };
    const abort = () => done(null);
    const timer = setTimeout(abort, options.timeoutMs ?? CHECK_TIMEOUT_MS);
    options.signal?.addEventListener("abort", abort, { once: true });
    socket.on("error", abort);
    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
      done(validTo && !Number.isNaN(validTo.getTime()) && cert.fingerprint256 ? { validTo, fingerprint: cert.fingerprint256 } : null);
    });
  });
}

/** The threshold to announce now, or null (already announced or not due). */
export function dueWarning(daysLeft: number, warnedDays: number | null): number | null {
  const due = [...CERT_WARN_DAYS].reverse().find((days) => daysLeft <= days) ?? null;
  if (due === null) return null;
  return warnedDays !== null && warnedDays <= due ? null : due;
}

const dateFormat = new Intl.DateTimeFormat("de-DE", { timeZone: STATUS_TIME_ZONE, dateStyle: "medium" });

export function certMessage(label: string, validTo: Date, now: Date): string {
  const ms = validTo.getTime() - now.getTime();
  const date = dateFormat.format(validTo);
  if (ms <= 0) return `Das TLS-Zertifikat von **${label}** ist abgelaufen (seit ${date}). Erneuern: \`sudo certbot renew\``;
  const days = Math.floor(ms / DAY_MS);
  const when = days === 0 ? "in weniger als einem Tag" : days === 1 ? "in 1 Tag" : `in ${days} Tagen`;
  return `Das TLS-Zertifikat von **${label}** läuft ${when} ab (${date}). Erneuern: \`sudo certbot renew\``;
}

export type CertTickDeps = { timeoutMs?: number; signal?: AbortSignal; fetchImpl?: typeof fetch; env?: Record<string, string | undefined> };

/** Reads every certificate once and posts due warnings. Returns the number of warnings posted. */
export async function runCertTick(db: Executor, targets: StatusTarget[], now: Date = new Date(), deps: CertTickDeps = {}): Promise<number> {
  const webhook = discordWebhookUrl(deps.env ?? process.env);
  if (!webhook) return 0;
  const endpoints = certEndpoints(targets, deps.env ?? process.env);
  const certs = await Promise.all(endpoints.map(async (address) => ({ address, cert: await readCertificate(address, deps) })));
  if (deps.signal?.aborted) return 0;
  let posted = 0;
  for (const { address, cert } of certs) {
    const endpoint = `${address.host}:${address.port}`;
    if (!cert) {
      log("warn", "status.cert_unreadable", { endpoint });
      continue;
    }
    const [row] = await db.select().from(platformStatusCerts).where(eq(platformStatusCerts.endpoint, endpoint));
    let warnedDays = row && row.fingerprint === cert.fingerprint ? row.warnedDays : null;
    const due = dueWarning((cert.validTo.getTime() - now.getTime()) / DAY_MS, warnedDays);
    if (due !== null && (await postDiscord(webhook, certMessage(endpointLabel(address), cert.validTo, now), deps.fetchImpl))) {
      warnedDays = due;
      posted++;
      log("warn", "status.cert_expiring", { endpoint, validTo: cert.validTo.toISOString(), days: due });
    }
    const values = { fingerprint: cert.fingerprint, validTo: cert.validTo, warnedDays, checkedAt: now };
    await db
      .insert(platformStatusCerts)
      .values({ endpoint, ...values })
      .onConflictDoUpdate({ target: platformStatusCerts.endpoint, set: values });
  }
  return posted;
}
