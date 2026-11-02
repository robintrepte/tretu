import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import { HUB_URL } from "./tests/e2e-real/env";

/**
 * The central admin against the REAL auth.tretu.de (`npm run test:e2e:admin-real`, needs `npm run build` and
 * `npm --prefix auth run build` first). tests/e2e-real/serve.ts resets both e2e databases and starts auth, its
 * events worker, the hub and the platform worker on loopback ports (auth 3141, hub 3142).
 */
const chromium = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "./tests/e2e-real",
  testMatch: /.*\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-admin-real" }]] : "list",
  use: {
    locale: "de-DE",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Loopback only: never through a proxy.
    launchOptions: { args: ["--no-proxy-server"], ...(chromium && { executablePath: chromium }) },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx tests/e2e-real/serve.ts",
    url: `${HUB_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
