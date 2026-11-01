import path from "node:path"
import { defineConfig } from "vitest/config"

/** End-to-end OIDC and legacy-import tests against the real app and Postgres (see tests/integration/global-setup.ts). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
})
