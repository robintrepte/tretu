import { expect, test } from "@playwright/test";

test("status page: one row per service with state, response time and 24 h / 90 day bars", async ({ page }) => {
  const res = await page.goto("/status");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Status" })).toBeVisible();
  await expect(page.getByTestId("status-overall")).toHaveAttribute("data-state", "down");
  await expect(page.getByTestId("status-overall")).toContainText("Mindestens ein Dienst ist ausgefallen");
  await expect(page.getByTestId("status-updated")).toHaveText(/^Stand: .+ Uhr$/);
  await expect(page.getByTestId("status-stale")).toHaveCount(0);
  await expect(page.getByTestId("status-notice")).toContainText("Wartung am Sonntag ab 22 Uhr");

  const expected = [
    ["tretu-web", "Website", "Läuft"],
    ["auth", "Tretu-Konto", "Läuft"],
    ["saga", "Saga", "Gestört"],
    ["play", "Play", "Ausgefallen"],
    ["hollowmere", "Hollowmere", "Läuft"],
    ["mc-dashboard", "Minecraft-Dashboard", "Keine Daten"],
    ["minecraft", "Minecraft-Server", "Läuft"],
    ["teamspeak", "TeamSpeak", "Läuft"],
  ] as const;
  for (const [id, name, state] of expected) {
    const row = page.getByTestId(`status-service-${id}`);
    await expect(row.getByRole("heading", { level: 3, name })).toBeVisible();
    await expect(row.getByTestId("status-state")).toHaveText(state);
  }

  const website = page.getByTestId("status-service-tretu-web");
  await expect(website.getByTestId("status-response")).toHaveText("87 ms");
  await expect(website.getByTestId("status-hours-tretu-web")).toContainText(/100\s%\sverfügbar/);
  await expect(website.locator('[data-testid="status-hours-tretu-web"] [data-tone]')).toHaveCount(24);
  await expect(website.locator('[data-testid="status-days-tretu-web"] [data-tone]')).toHaveCount(90);

  // Play was down for a day: one red day bar, a red bar this hour, availability below 100 %.
  const play = page.getByTestId("status-service-play");
  await expect(play.locator('[data-testid="status-days-play"] [data-tone="down"]')).not.toHaveCount(0);
  await expect(play.getByTestId("status-days-play")).not.toContainText(/100\s%/);
  const downHour = play.locator('[data-testid="status-hours-play"] [data-tone="down"]').first();
  await expect(downHour).toHaveAttribute("title", /Uhr: .*verfügbar .*× ausgefallen/);

  const mc = page.getByTestId("status-service-mc-dashboard");
  await expect(mc.getByTestId("status-hours-mc-dashboard")).toContainText("keine Daten");
  await expect(mc.locator('[data-testid="status-hours-mc-dashboard"] [data-tone="none"]')).toHaveCount(24);

  // Game servers: players / users online.
  await expect(page.getByTestId("status-service-minecraft").getByTestId("status-users")).toHaveText("3 / 20 Spieler online");
  await expect(page.getByTestId("status-service-teamspeak").getByTestId("status-users")).toHaveText("4 Nutzer online");
  await expect(page.getByTestId("status-service-minecraft")).toContainText("mc.tretu.de");

  // Linked from the footer.
  const footerLink = page.getByRole("contentinfo").getByRole("link", { name: "Status" });
  await expect(footerLink).toHaveAttribute("href", "/status");
});

test("status page in English via the NEXT_LOCALE cookie, usable on a phone", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/status");
  await expect(page.getByTestId("status-overall")).toContainText("At least one service is down");
  await expect(page.getByTestId("status-updated")).toHaveText(/^As of /);
  await expect(page.getByTestId("status-service-saga").getByTestId("status-state")).toHaveText("Degraded");
  await expect(page.getByTestId("status-service-tretu-web").getByTestId("status-state")).toHaveText("Running");
  await expect(page.getByTestId("status-service-mc-dashboard").getByTestId("status-state")).toHaveText("No data");
  await expect(page.getByTestId("status-hours-hollowmere")).toContainText("Last 24 hours");
  await expect(page.getByTestId("status-service-minecraft").getByTestId("status-users")).toHaveText("3 / 20 players online");
  await expect(page.getByTestId("status-service-teamspeak").getByTestId("status-users")).toHaveText("4 users online");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
});

test("GET /api/status: the same data as JSON, public and cached", async ({ request }) => {
  const res = await request.get("/api/status");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("max-age=30");
  const body = (await res.json()) as {
    status: string;
    stale: boolean;
    notice: string;
    services: { id: string; name: string; state: string; uptime90d: number | null; usersOnline: number | null; usersMax: number | null; hours: unknown[]; days: unknown[] }[];
  };
  expect(body.status).toBe("down");
  expect(body.stale).toBe(false);
  expect(body.notice).toBe("Wartung am Sonntag ab 22 Uhr");
  expect(body.services.map((s) => [s.id, s.state])).toEqual([
    ["tretu-web", "up"],
    ["auth", "up"],
    ["saga", "degraded"],
    ["play", "down"],
    ["hollowmere", "up"],
    ["mc-dashboard", "unknown"],
    ["minecraft", "up"],
    ["teamspeak", "up"],
  ]);
  for (const service of body.services) {
    expect(service.hours).toHaveLength(24);
    expect(service.days).toHaveLength(90);
  }
  expect(body.services.find((s) => s.id === "play")!.uptime90d).toBeLessThan(100);
  const minecraft = body.services.find((s) => s.id === "minecraft")!;
  expect([minecraft.usersOnline, minecraft.usersMax]).toEqual([3, 20]);
  expect(JSON.stringify(body)).not.toContain("127.0.0.1:9");
});
