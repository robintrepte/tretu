/**
 * Helpers for the real hub + auth e2e: accounts made through auth's own sign-up (email confirmed through the
 * mail it writes), an authenticator app (RFC 6238 TOTP), and auth's admin CLI.
 */
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, type BrowserContext, type Page } from "@playwright/test";

import { AUTH_DATABASE_URL, AUTH_DIR, AUTH_URL, HUB_URL, MAIL_DIR } from "./env";

export type Account = { sub: string; username: string; email: string; password: string; name: string };

const PASSWORD = "ein langes geheimes Passwort 9";
let counter = 0;

/** A unique, valid username (3–24 of `A-Za-z0-9_-`). */
export function uniqueName(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${++counter}`.slice(0, 20);
}

async function mailLinkFor(to: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const files = (await readdir(MAIL_DIR).catch(() => [] as string[])).sort().reverse();
    for (const file of files) {
      const mail = JSON.parse(await readFile(path.join(MAIL_DIR, file), "utf8")) as { to: string; text: string };
      if (mail.to === to) return mail.text.match(/https?:\/\/\S+/)![0];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no mail to ${to}`);
}

/** Registers at auth and confirms the email; `context` is then signed in at auth. */
export async function signUp(context: BrowserContext, username: string, sub: () => Promise<string>): Promise<Account> {
  const account = { username, email: `${username}@example.test`, password: PASSWORD, name: `${username[0]!.toUpperCase()}${username.slice(1)}` };
  const res = await context.request.post(`${AUTH_URL}/api/auth/sign-up/email`, {
    data: { ...account, callbackURL: "/konto" },
    headers: { origin: AUTH_URL },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const page = await context.newPage();
  await page.goto(await mailLinkFor(account.email));
  await expect(page).toHaveURL(/\/konto/);
  await page.close();
  return { ...account, sub: await sub() };
}

/* ------------------------------- authenticator ------------------------------ */

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP (SHA-1, 6 digits), the algorithm behind auth's TOTP (30 s steps). */
export function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export type Authenticator = { code: () => Promise<string> };

/**
 * Turns on two-factor sign-in for the account signed in at auth in `context` and returns its authenticator.
 * auth accepts every code once, so each `code()` waits for a time step not used before (at most 30 s).
 */
export async function enableTwoFactor(context: BrowserContext, password: string): Promise<Authenticator> {
  const enable = await context.request.post(`${AUTH_URL}/api/auth/two-factor/enable`, { data: { password }, headers: { origin: AUTH_URL } });
  expect(enable.ok(), await enable.text()).toBe(true);
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const key = base32Decode(new URL(totpURI).searchParams.get("secret")!);
  let last = -1;
  const device: Authenticator = {
    code: async () => {
      const step = () => Math.floor(Date.now() / 30_000);
      while (step() <= last) await new Promise((r) => setTimeout(r, 250));
      last = step();
      return hotp(key, last);
    },
  };
  const verify = await context.request.post(`${AUTH_URL}/api/auth/two-factor/verify-totp`, { data: { code: await device.code() }, headers: { origin: AUTH_URL } });
  expect(verify.ok(), await verify.text()).toBe(true);
  return device;
}

/* ------------------------------------ CLI ----------------------------------- */

/** `npm run admin -- <args>` in auth/ (the owner's server CLI), against the e2e database. */
export function authCli(...args: string[]): string {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: AUTH_DATABASE_URL, NODE_ENV: "production" };
  for (const key of ["TRETU_PLATFORM_URL", "TRETU_APP_SECRET"]) delete env[key];
  const result = spawnSync("npm", ["run", "--silent", "admin", "--", ...args], { cwd: AUTH_DIR, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`npm run admin -- ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

/* ------------------------------ signing in ---------------------------------- */

/** At auth's login page: username + password, then the authenticator code when asked. */
export async function signInAtAuth(page: Page, account: Pick<Account, "username" | "password">, authenticator?: Authenticator) {
  await page.getByLabel("E-Mail oder Benutzername").fill(account.username);
  await page.getByLabel("Passwort", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  if (authenticator) {
    const code = page.getByLabel("Code", { exact: true });
    await expect(code).toBeVisible();
    await code.fill(await authenticator.code());
    await page.getByRole("button", { name: "Bestätigen", exact: true }).click();
  }
}

/**
 * "Mit Tretu-Konto anmelden" on the hub: through auth (signing in there when `account` is given, else with the
 * session the context already has at auth) and back to the hub dashboard.
 */
export async function signInToHub(page: Page, account?: Pick<Account, "username" | "password">, authenticator?: Authenticator) {
  await page.goto(`${HUB_URL}/login`);
  await page.getByRole("button", { name: "Mit Tretu-Konto anmelden" }).click();
  if (account) {
    await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login`));
    await signInAtAuth(page, account, authenticator);
  }
  // "commit": the landing page (e.g. the home page with its embeds) need not finish loading, only the hub must be reached.
  await page.waitForURL((url) => url.origin === HUB_URL && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/login"), {
    timeout: 30_000,
    waitUntil: "commit",
  });
}

/** The hub's session for this context (Better Auth), or null. */
export async function hubSession(context: BrowserContext): Promise<{ user: { id: string } } | null> {
  const res = await context.request.get(`${HUB_URL}/api/auth/get-session`);
  if (!res.ok()) return null;
  return ((await res.json()) as { user: { id: string } } | null) ?? null;
}

export const reasonFor = (what: string) => `${what} (E2E ${randomUUID().slice(0, 8)})`;
