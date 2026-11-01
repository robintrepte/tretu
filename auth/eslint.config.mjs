import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "log", "info"] }],
      // After sign-in/out a full page load is intended: the session cookie changed and every server component must re-render.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**", ".outbox/**", "reports/**"]),
])
