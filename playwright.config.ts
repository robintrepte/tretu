import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the hub (`npm run test:e2e`, needs `npm run build` first). tests/e2e/serve.ts resets the
 * database `tretu_web_test_e2e`, seeds it and runs `next start` on E2E_PORT (default 3132).
 */
const port = Number(process.env.E2E_PORT ?? 3132);
const baseURL = `http://localhost:${port}`;
// The build container ships Chromium outside Playwright's cache; elsewhere Playwright's own browser is used.
const chromium = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.e2e\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "de-DE",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(chromium && { launchOptions: { executablePath: chromium } }),
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx tests/e2e/serve.ts",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { E2E_PORT: String(port) },
  },
});
