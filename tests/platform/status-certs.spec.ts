/** Certificate expiry warnings: self-signed certificates of short validity on a local TLS server, Discord mocked. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";
import { after, before, beforeEach, test } from "node:test";

import { closeDatabase, resetDatabase } from "./helpers";
import { platformStatusCerts } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { readCertificate, runCertTick } from "../../src/lib/status/certs";

const dir = mkdtempSync(path.join(tmpdir(), "tretu-certs-"));
/** A self-signed certificate for 127.0.0.1 valid for `days` days from now. */
function certificate(days: number): { key: Buffer; cert: Buffer } {
  const key = path.join(dir, `key-${days}.pem`);
  const cert = path.join(dir, `cert-${days}.pem`);
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", String(days), "-subj", "/CN=127.0.0.1"], {
    stdio: "ignore",
  });
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

let server: tls.Server;
let port = 0;
const certs: Record<number, { key: Buffer; cert: Buffer }> = {};

before(async () => {
  for (const days of [30, 10, 2]) certs[days] = certificate(days);
  server = tls.createServer({ ...certs[30] }, (socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
  await closeDatabase();
});
beforeEach(resetDatabase);

const useCert = (days: number) => server.setSecureContext({ ...certs[days] });

function discord() {
  const posts: string[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    posts.push((JSON.parse(String(init?.body)) as { content: string }).content);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return { posts, fetchImpl };
}

test("reads validity and fingerprint of the presented certificate", async () => {
  useCert(10);
  const info = await readCertificate({ host: "127.0.0.1", port });
  assert.ok(info);
  const days = (info.validTo.getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 9 && days <= 10, String(days));
  assert.match(info.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.equal(await readCertificate({ host: "127.0.0.1", port: 9 }), null);
});

test("warns at 14 and at 3 days, once per threshold and certificate; nothing without a webhook", async () => {
  const env = { TRETU_STATUS_CERT_HOSTS: `127.0.0.1:${port}`, TRETU_STATUS_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/token" };
  const { posts, fetchImpl } = discord();
  const tick = (extra: Record<string, string | undefined> = {}) => runCertTick(platformDb, [], new Date(), { fetchImpl, env: { ...env, ...extra } });

  useCert(30);
  assert.equal(await tick(), 0, "30 days left: nothing to say");
  useCert(10);
  assert.equal(await tick({ TRETU_STATUS_DISCORD_WEBHOOK_URL: undefined }), 0, "no webhook, no work");
  assert.equal((await platformDb.select().from(platformStatusCerts))[0]!.warnedDays, null);

  assert.equal(await tick(), 1);
  assert.match(posts[0]!, new RegExp(`^Das TLS-Zertifikat von \\*\\*127\\.0\\.0\\.1:${port}\\*\\* läuft in (9|10) Tagen ab`));
  assert.equal(await tick(), 0, "the 14-day warning is sent once");
  assert.equal((await platformDb.select().from(platformStatusCerts))[0]!.warnedDays, 14);

  useCert(2); // e.g. renewal failed and an old certificate is served
  assert.equal(await tick(), 1);
  assert.match(posts[1]!, /läuft in (1 Tag|2 Tagen) ab/);
  assert.equal(await tick(), 0);
  assert.equal(posts.length, 2);

  useCert(30); // renewed: a new certificate starts without warnings
  await tick();
  const [row] = await platformDb.select().from(platformStatusCerts);
  assert.equal(row!.warnedDays, null);
  assert.equal(posts.length, 2);
});
