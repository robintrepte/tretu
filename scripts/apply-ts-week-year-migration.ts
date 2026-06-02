import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = resolve(process.cwd(), process.env.SQLITE_DATABASE_PATH ?? "local.sqlite");
const sql = readFileSync(resolve(process.cwd(), "drizzle/0005_ts_users_week_year.sql"), "utf8");

const db = new Database(dbPath);
for (const statement of sql.split("--> statement-breakpoint")) {
  const trimmed = statement.trim();
  if (trimmed) db.exec(trimmed);
}
console.log("Applied week/year columns to", dbPath);
