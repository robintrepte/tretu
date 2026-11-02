/**
 * The central admin end to end against the REAL auth.tretu.de (tests/e2e-real/serve.ts starts both apps, their
 * workers and databases; nothing between them is mocked):
 *
 * an admin made with auth's CLI and TOTP signs in to the hub through auth (2FA step included), finds a normal
 * account, locks it (its auth sessions and hub session end, auth's login shows the lock), unlocks it, ends its
 * sessions, corrects its wallet, grants it a badge, previews and merges an imported old account into it, and
 * finds every step in the hub's audit log and in the account's activity log at auth. A second admin without
 * 2FA (role granted by the CLI, delivered to the hub as a user.updated event) gets the friendly 2FA message.
 */
import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

import { AUTH_DATABASE_URL, AUTH_URL, HUB_URL } from "./env";
import { authCli, enableTwoFactor, hubSession, reasonFor, signInAtAuth, signInToHub, signUp, uniqueName, type Account, type Authenticator } from "./support";

test.describe.configure({ mode: "serial" });

const authDb = postgres(AUTH_DATABASE_URL, { max: 1, onnotice: () => {} });
const subOf = (username: string) => async () => {
  const [row] = await authDb<{ id: string }[]>`select id from "user" where username = ${username.toLowerCase()}`;
  if (!row) throw new Error(`no auth user ${username}`);
  return row.id;
};

/** One browser profile per person (cookies of auth on localhost, of the hub on 127.0.0.1). */
const people: Record<"admin" | "mia" | "noah", { context: BrowserContext; page: Page } | undefined> = { admin: undefined, mia: undefined, noah: undefined };
let admin: Account;
let adminTotp: Authenticator;
let mia: Account;
let noah: Account;
const legacySub = randomUUID();
const reasons = { lock: reasonFor("Spam im Chat"), unlock: reasonFor("Einspruch angenommen"), revoke: reasonFor("Gerät verloren"), wallet: reasonFor("Turnierpreis"), badge: reasonFor("Offline-Turnier"), merge: reasonFor("Gleiche Person") };

async function person(browser: Browser, who: keyof typeof people) {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  people[who] = { context, page };
  return people[who]!;
}

const adminPage = () => people.admin!.page;
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Tretu-Verwaltung" }).getByRole("link", { name, exact: true }).click();

async function confirmWithReason(page: Page, reason: string, message: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("admin-reason").fill(reason);
  await dialog.getByTestId("admin-confirm").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(message).first()).toBeVisible();
}

test.afterAll(async () => {
  for (const p of Object.values(people)) await p?.context.close();
  await authDb.end();
});

test("accounts: an admin with TOTP (auth CLI), a normal account, a legacy import and a future admin without 2FA", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await person(browser, "admin");
  const adminName = uniqueName("adm");
  admin = await signUp(a.context, adminName, subOf(adminName));
  adminTotp = await enableTwoFactor(a.context, admin.password);
  expect(authCli("grant", admin.username, "admin")).toContain("admin");
  // A fresh browser for the hub sign-in: auth must ask for password and code.
  await a.context.clearCookies();

  const m = await person(browser, "mia");
  const miaName = uniqueName("mia");
  mia = await signUp(m.context, miaName, subOf(miaName));

  const n = await person(browser, "noah");
  const noahName = uniqueName("noah");
  noah = await signUp(n.context, noahName, subOf(noahName));

  // An account the legacy import created for Mia's old Saga account (same email, name with a suffix).
  await authDb`insert into "user" (id, name, email, email_verified, username, display_username)
               values (${legacySub}, ${`${mia.name} (Saga)`}, ${`${legacySub}@users.tretu.invalid`}, false, ${`${mia.username}_2`}, ${`${mia.username}_2`})`;
  await authDb`insert into legacy_link (app, legacy_user_id, user_id, legacy_username, legacy_email, method)
               values ('saga', '4711', ${legacySub}, ${mia.username}, ${mia.email}, 'import')`;
});

test("the admin signs in to the hub through auth (password + TOTP) and opens the central admin", async () => {
  test.setTimeout(120_000);
  const page = adminPage();
  await signInToHub(page, admin, adminTotp);
  await page.goto(`${HUB_URL}/dashboard`);
  await page.getByRole("link", { name: "Tretu-Verwaltung" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
  await expect(page.getByTestId("admin-actor-blocked")).toHaveCount(0);
  // Real numbers from auth's stats endpoint.
  await expect(page.getByTestId("kpi-total")).toContainText(/[1-9]/);
  // Service status written by the hub's platform worker, which checks both running apps.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("service-auth")).toContainText("Läuft", { timeout: 1000 });
    await expect(page.getByTestId("service-tretu-web")).toContainText("Läuft", { timeout: 1000 });
  }).toPass({ timeout: 60_000 });
});

test("Mia signs in to the hub with her auth session", async () => {
  const { page, context } = people.mia!;
  await signInToHub(page);
  expect(await hubSession(context)).not.toBeNull();
});

test("search → detail → lock with a reason: auth and hub sessions end, auth's login shows the lock; unlock", async () => {
  const page = adminPage();
  await nav(page, "Konten");
  await page.getByTestId("account-search").fill(mia.username);
  await page.getByRole("button", { name: "Suchen" }).click();
  const results = page.getByTestId("account-results");
  // Mia, and her imported old account (same name with "(Saga)") further down.
  const link = results.locator(`a[href="/dashboard/admin/konten/${mia.sub}"]`);
  await expect(link).toContainText(mia.name);
  await expect(results.locator(`a[href="/dashboard/admin/konten/${legacySub}"]`)).toBeVisible();
  await link.click();

  await expect(page.getByTestId("account-name")).toHaveText(mia.name);
  await expect(page.getByTestId("provider-password")).toBeVisible();
  await expect(page.getByTestId("action-remove-link-password")).toHaveCount(0);
  // Her session at auth, with the app it was last used for.
  await expect(page.getByTestId("account-sessions")).toContainText("tretu-web");

  await page.getByTestId("action-lock").click();
  await confirmWithReason(page, reasons.lock, "Konto gesperrt.");
  await expect(page.getByTestId("account-locked")).toBeVisible();
  await expect(page.getByText("Keine aktiven Sitzungen.")).toBeVisible();

  // Mia: signed out of the hub and of auth; auth's login explains the lock.
  const { page: miaPage, context: miaContext } = people.mia!;
  expect(await hubSession(miaContext)).toBeNull();
  await miaPage.goto(`${AUTH_URL}/konto`);
  await expect(miaPage).toHaveURL(/\/login/);
  await signInAtAuth(miaPage, mia);
  await expect(miaPage.getByRole("alert").filter({ hasText: "Dein Tretu-Konto ist gesperrt." })).toBeVisible();
  await expect(miaPage).toHaveURL(/\/login/);

  await page.getByTestId("action-unlock").click();
  await confirmWithReason(page, reasons.unlock, "Konto entsperrt.");
  await expect(page.getByTestId("account-locked")).toHaveCount(0);
  await miaPage.goto(`${AUTH_URL}/login`);
  await signInAtAuth(miaPage, mia);
  await expect(miaPage).toHaveURL(/\/konto/);
});

test("ending every session signs Mia out at auth", async () => {
  const page = adminPage();
  await page.reload();
  await expect(page.getByTestId("account-sessions")).toBeVisible();
  await page.getByTestId("action-revoke-sessions").click();
  await confirmWithReason(page, reasons.revoke, "Alle Sitzungen beendet.");
  await expect(page.getByText("Keine aktiven Sitzungen.")).toBeVisible();
  const miaPage = people.mia!.page;
  await miaPage.goto(`${AUTH_URL}/konto`);
  await expect(miaPage).toHaveURL(/\/login/);
});

test("wallet correction and a badge granted by hand", async () => {
  const page = adminPage();
  await page.goto(`${HUB_URL}/dashboard/admin/wallet/${mia.sub}`);
  // Whatever the platform booked already (welcome bonus, daily top-up), the correction adds exactly 250.
  const balance = async () => Number((await page.getByTestId("wallet-balance").innerText()).replace(/\D/g, ""));
  const before = await balance();
  expect(before).toBeGreaterThanOrEqual(500);
  await page.getByTestId("action-adjust").click();
  await page.getByRole("dialog").getByTestId("adjust-amount").fill("250");
  await confirmWithReason(page, reasons.wallet, "Guthaben korrigiert.");
  await expect.poll(balance).toBe(before + 250);
  await expect(page.getByTestId("wallet-row").first()).toContainText("+250");

  await page.goto(`${HUB_URL}/dashboard/admin/konten/${mia.sub}`);
  await page.getByTestId("action-grant-badge").click();
  await page.getByRole("dialog").getByTestId("grant-badge-select").selectOption("play.first-win");
  await confirmWithReason(page, reasons.badge, "Abzeichen vergeben.");
  await expect(page.getByTestId("badge-play.first-win")).toBeVisible();
});

test("legacy account: merge preview from auth, then the merge", async () => {
  const page = adminPage();
  await nav(page, "Altkonten");
  const merge = page.getByTestId(`legacy-merge-${legacySub}-${mia.sub}`);
  await expect(merge).toBeVisible();
  await merge.click();
  const dialog = page.getByRole("dialog");
  const summary = dialog.getByTestId("merge-summary");
  await expect(summary).toContainText(`@${mia.username}_2 wird in @${mia.username} übernommen.`);
  await expect(summary).toContainText(`Alte App-Konten: saga: ${mia.username}`);
  await expect(summary).toContainText(`@${mia.username}_2 wird gelöscht`);
  await dialog.getByTestId("admin-reason").fill(reasons.merge);
  await dialog.getByTestId("merge-confirm").click();
  await expect(page.getByText("Konten zusammengeführt.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Keine offenen Altkonten.")).toBeVisible();
  const [left] = await authDb<{ n: number }[]>`select count(*)::int as n from "user" where id = ${legacySub}`;
  expect(left!.n).toBe(0);
});

test("every step is in the hub's audit log and in Mia's activity log at auth", async () => {
  const page = adminPage();
  await page.goto(`${HUB_URL}/dashboard/admin/protokoll?target=${mia.sub}`);
  const rows = page.getByTestId("audit-row");
  for (const [label, reason] of [
    ["Konto gesperrt", reasons.lock],
    ["Konto entsperrt", reasons.unlock],
    ["Sitzungen beendet", reasons.revoke],
    ["Guthaben korrigiert", reasons.wallet],
    ["Abzeichen vergeben", reasons.badge],
    ["Konten zusammengeführt", reasons.merge],
  ]) {
    const row = rows.filter({ hasText: reason });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(label);
    await expect(row).not.toContainText("fehlgeschlagen");
  }

  // auth's own log of the account, as the detail page shows it (admin and reason from auth's entries).
  await page.goto(`${HUB_URL}/dashboard/admin/konten/${mia.sub}`);
  const authLog = page.getByTestId("auth-audit-row");
  for (const [event, reason] of [
    ["admin.locked", reasons.lock],
    ["admin.unlocked", reasons.unlock],
    ["admin.sessions_revoked", reasons.revoke],
    ["admin.merge", reasons.merge],
  ]) {
    const row = authLog.filter({ hasText: reason });
    await expect(row).toContainText(event);
    await expect(row).toContainText(`@${admin.username}`);
  }
  await expect(page.getByTestId("hub-audit-row").first()).toBeVisible();

  // And Mia sees the lock in her own security log at auth (without the admin's reason).
  const miaPage = people.mia!.page;
  await miaPage.goto(`${AUTH_URL}/login`);
  await signInAtAuth(miaPage, mia);
  await expect(miaPage).toHaveURL(/\/konto/);
  await miaPage.goto(`${AUTH_URL}/konto?tab=sicherheit`);
  await expect(miaPage.getByText("Konto vom Tretu-Team gesperrt").first()).toBeVisible();
  await expect(miaPage.getByText(reasons.lock)).toHaveCount(0);
});

test("an admin without 2FA gets the friendly 2FA message instead of the account admin", async () => {
  test.setTimeout(120_000);
  const { page, context } = people.noah!;
  await signInToHub(page);
  expect(await hubSession(context)).not.toBeNull();

  // The owner grants the role on the server; auth's events worker tells the hub (user.updated → local admin).
  authCli("grant", noah.username, "admin");
  await expect(async () => {
    await page.goto(`${HUB_URL}/dashboard/admin`);
    expect(new URL(page.url()).pathname).toBe("/dashboard/admin");
  }).toPass({ timeout: 60_000 });

  const banner = page.getByTestId("admin-actor-blocked");
  await expect(banner).toContainText("Aktiviere 2FA in Mein Konto, um die Verwaltung zu nutzen.");
  await expect(banner.getByTestId("admin-account-link")).toHaveAttribute("href", `${AUTH_URL}/konto?tab=sicherheit`);
  await expect(page.getByTestId("kpi-accounts")).toHaveCount(0);
  await page.goto(`${HUB_URL}/dashboard/admin/konten?q=${mia.username}`);
  await expect(page.getByText("Aktiviere 2FA in Mein Konto, um die Verwaltung zu nutzen.")).toBeVisible();
  await expect(page.getByTestId("account-results")).toHaveCount(0);
});
