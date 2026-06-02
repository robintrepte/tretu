import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = resolve(process.cwd(), process.env.SQLITE_DATABASE_PATH ?? "local.sqlite");
const sql = readFileSync(resolve(process.cwd(), "drizzle/0004_ts_server_snapshots.sql"), "utf8");

const db = new Database(dbPath);
for (const statement of sql.split("--> statement-breakpoint")) {
  const trimmed = statement.trim();
  if (trimmed) db.exec(trimmed);
}
console.log("Applied ts_server_snapshots migration to", dbPath);
