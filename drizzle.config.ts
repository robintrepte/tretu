import "./src/lib/env/load-local-env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Every `src/db/*schema.ts` file (core schema and, once merged, the platform schema).
  schema: "./src/db/*schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_web",
  },
});
