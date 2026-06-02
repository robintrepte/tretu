import path from "node:path";

import "./src/lib/env/load-local-env.ts";
import { defineConfig } from "drizzle-kit";

const raw = process.env.SQLITE_DATABASE_PATH ?? "local.sqlite";
const sqliteUrl = path.isAbsolute(raw)
  ? raw
  : raw.startsWith("./") || raw.startsWith("../")
    ? raw
    : `./${raw}`;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: sqliteUrl,
  },
});
