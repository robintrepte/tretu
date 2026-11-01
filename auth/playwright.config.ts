import { existsSync } from "node:fs"
import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.E2E_PORT ?? 3131)
const baseURL = `http://localhost:${port}`
// The build container ships Chromium outside Playwright's cache; elsewhere Playwright's own browser is used.
const chromium = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined)

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
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
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    // Resets the e2e database, migrates it and runs `next start` (needs `npm run build` first).
    command: "npx tsx e2e/serve.ts",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_PORT: String(port),
      MAIL_OUTBOX_DIR: path.join(import.meta.dirname, ".outbox", "e2e"),
    },
  },
})
