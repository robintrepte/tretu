import { expect, test, type BrowserContext } from "@playwright/test";
import { serializeSignedCookie } from "better-call";

import { AUTH_MOCK_URL, E2E_SECRET, SESSION_TOKEN, STEAM_ID, TS_UID } from "./fixtures";

async function signIn(context: BrowserContext, baseURL: string) {
  // The same signed cookie Better Auth sets after a login (`tretu.session_token` on http).
  const header = await serializeSignedCookie("tretu.session_token", SESSION_TOKEN, E2E_SECRET);
  const value = header.split(";")[0].split("=").slice(1).join("=");
  await context.addCookies([{ name: "tretu.session_token", value, url: baseURL }]);
}

test("public profile shows linked accounts: Steam link, TeamSpeak without its uid", async ({ page }) => {
  const res = await page.goto("/u/steamy");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Steamy" })).toBeVisible();
  const steam = page.getByTestId("profile-steam");
  await expect(steam).toBeVisible();
  await expect(steam).toHaveAttribute("href", `https://steamcommunity.com/profiles/${STEAM_ID}`);
  await expect(steam).toHaveAttribute("rel", /noopener/);
  await expect(steam).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("profile-linked-teamspeak")).toHaveText("TeamSpeak");
  await expect(page.getByTestId("profile-linked-discord")).toBeVisible();
  await expect(page.getByTestId("profile-linked-minecraft")).toHaveText(/SteamyMC/);
  const html = await page.content();
  expect(html).not.toContain(TS_UID);
  expect(html).not.toContain("424242");
});

test("friends-only profile hides the linked accounts from strangers", async ({ page }) => {
  await page.goto("/u/hidden");
  await expect(page.getByText("Dieses Profil ist nicht öffentlich")).toBeVisible();
  await expect(page.getByTestId("profile-steam")).toHaveCount(0);
  expect(await page.content()).not.toContain(STEAM_ID);
});

test("English UI via the NEXT_LOCALE cookie", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto("/u/steamy");
  await expect(page.getByText("Linked accounts")).toBeVisible();
  await expect(page.getByTestId("profile-steam")).toHaveText(/Steam profile/);
});

test("signed-in owner: 'Steam verbinden' on the profile, TeamSpeak section with refusal reason at #teamspeak", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!);
  await page.goto("/u/robin");
  const connect = page.getByTestId("profile-connect-steam");
  await expect(connect).toBeVisible();
  await expect(connect).toHaveAttribute("href", `${AUTH_MOCK_URL}/konto`);

  await page.goto("/einstellungen#teamspeak");
  const section = page.locator("section#teamspeak");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "TeamSpeak verknüpfen" })).toBeVisible();
  await expect(section.getByTestId("teamspeak-error")).toHaveText(/bereits mit einem anderen Tretu-Konto verknüpft/);
  await expect(section.getByRole("button", { name: "Verknüpfung starten" })).toBeVisible();
  await expect(section).toBeInViewport();
});

test("security headers on every page", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const headers = res.headers();
  const csp = headers["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("upgrade-insecure-requests");
  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("friendly 404 page", async ({ page }) => {
  const res = await page.goto("/gibt-es-nicht");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Zur Startseite" })).toBeVisible();
});

test("health check reports db, migrations and worker without secrets", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.json();
  expect(body).toMatchObject({ status: "ok", app: "tretu-web", checks: { db: "ok", migrations: "ok", worker: "ok" } });
  expect(JSON.stringify(body)).not.toContain("postgres");
});

test("signed platform API rejects unsigned calls with a JSON error", async ({ request }) => {
  const res = await request.get("/api/v1/badges");
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});
