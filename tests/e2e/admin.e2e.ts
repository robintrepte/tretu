/**
 * Central admin in the browser (against the mocked, signature-checking auth admin API from tests/e2e/serve.ts):
 * search → detail → lock with a reason → audit row; wallet adjustment; manual badge grant; access control.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { serializeSignedCookie } from "better-call";

import { E2E_SECRET, MEMBER_SESSION_TOKEN, SESSION_TOKEN, USERS } from "./fixtures";

async function signIn(context: BrowserContext, baseURL: string, token = SESSION_TOKEN) {
  const header = await serializeSignedCookie("tretu.session_token", token, E2E_SECRET);
  const value = header.split(";")[0].split("=").slice(1).join("=");
  await context.addCookies([{ name: "tretu.session_token", value, url: baseURL }]);
}

async function confirmWithReason(page: Page, reason: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("admin-reason").fill(reason);
  await dialog.getByTestId("admin-confirm").click();
  await expect(dialog).toBeHidden();
}

test("only Tretu admins reach the central admin", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, MEMBER_SESSION_TOKEN);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Tretu-Verwaltung" })).toHaveCount(0);
  await page.goto("/dashboard/admin/konten");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("overview: account KPIs from auth, noindex and no caching", async ({ page, context, baseURL, request }) => {
  await signIn(context, baseURL!);
  const res = await page.goto("/dashboard/admin");
  expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(res?.headers()["cache-control"]).toMatch(/no-store/);
  await expect(page.getByRole("heading", { level: 1, name: "Übersicht" })).toBeVisible();
  await expect(page.getByTestId("kpi-total")).toContainText("3");
  await expect(page.getByTestId("app-admin-links")).toContainText("saga.tretu.de/admin");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // Anonymous visitors never see it.
  const anonymous = await request.get("/dashboard/admin", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
});

test("search → detail → lock with a reason → audit row", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Tretu-Verwaltung" }).click();
  await page.getByRole("navigation", { name: "Tretu-Verwaltung" }).getByRole("link", { name: "Konten", exact: true }).click();

  await page.getByTestId("account-search").fill("SteamyMC");
  await page.getByRole("button", { name: "Suchen" }).click();
  const results = page.getByTestId("account-results");
  await expect(results.getByRole("link", { name: /Steamy/ })).toBeVisible();
  await results.getByRole("link", { name: /Steamy/ }).click();

  await expect(page.getByTestId("account-name")).toHaveText("Steamy");
  await expect(page.getByTestId("provider-steam")).toBeVisible();
  await expect(page.getByTestId("account-sessions")).toContainText("203.0.113.9");

  await page.getByTestId("action-lock").click();
  // The confirm button stays useless without a reason (required field).
  await page.getByRole("dialog").getByTestId("admin-confirm").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await confirmWithReason(page, "Spam im Chat (Ticket 4711)");
  await expect(page.getByText("Konto gesperrt.")).toBeVisible();
  await expect(page.getByTestId("account-locked")).toBeVisible();
  await expect(page.getByTestId("action-unlock")).toBeVisible();
  await expect(page.getByTestId("hub-audit-row").first()).toContainText("Konto gesperrt");

  await page.getByRole("navigation", { name: "Tretu-Verwaltung" }).getByRole("link", { name: "Protokoll" }).click();
  await page.getByTestId("audit-filter-target").fill(USERS.steamy.sub);
  await page.getByTestId("audit-filter-action").selectOption("account.lock");
  await page.getByRole("button", { name: "Anwenden" }).click();
  const row = page.getByTestId("audit-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Konto gesperrt");
  await expect(row).toContainText("Steamy");
  await expect(row).toContainText("Robin");
  await expect(row).toContainText("Spam im Chat (Ticket 4711)");
});

test("wallet: manual adjustment books once and shows in the history", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!);
  await page.goto("/dashboard/admin/wallet");
  await page.getByTestId("wallet-lookup").fill(USERS.steamy.sub);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/admin/wallet/${USERS.steamy.sub}$`));

  await page.getByTestId("action-adjust").click();
  await page.getByRole("dialog").getByTestId("adjust-amount").fill("150");
  await confirmWithReason(page, "Turnierpreis");
  await expect(page.getByText("Guthaben korrigiert.")).toBeVisible();
  // Welcome bonus (500) on first access + 150.
  await expect(page.getByTestId("wallet-balance")).toContainText("650");
  const rows = page.getByTestId("wallet-row");
  await expect(rows.first()).toContainText("Korrektur");
  await expect(rows.first()).toContainText("Turnierpreis");
  await expect(rows.first()).toContainText("+150");

  await page.goto("/dashboard/admin/wallet");
  await expect(page.getByTestId("wallet-top")).toContainText("Steamy");
});

test("badges: grant a badge by hand, the holder list and catalog count follow", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!);
  await page.goto("/dashboard/admin/abzeichen");
  await expect(page.getByTestId("holders-play.first-win")).toHaveText("0");
  await page.getByTestId("catalog-play.first-win").getByRole("link", { name: "Erster Sieg" }).click();

  await page.getByTestId("action-grant-badge").click();
  await page.getByRole("dialog").getByTestId("grant-sub").fill(USERS.steamy.sub);
  await confirmWithReason(page, "Offline-Turnier gewonnen");
  await expect(page.getByText("Abzeichen vergeben.")).toBeVisible();
  await expect(page.getByTestId(`holder-${USERS.steamy.sub}`)).toContainText("Steamy");

  await page.goto("/dashboard/admin/abzeichen");
  await expect(page.getByTestId("holders-play.first-win")).toHaveText("1");
  await page.goto(`/dashboard/admin/konten/${USERS.steamy.sub}`);
  await expect(page.getByTestId("badge-play.first-win")).toBeVisible();
});
