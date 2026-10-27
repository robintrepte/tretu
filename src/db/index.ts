import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

import { SQLITE_DATABASE_PATH } from "@/lib/env/server";
import { ensureDashboardSchema } from "./ensure-dashboard-schema";
import * as schema from "./schema";

export const sqlite = new Database(SQLITE_DATABASE_PATH);
sqlite.pragma("busy_timeout = 5000");
ensureDashboardSchema(sqlite);
export const db = drizzle(sqlite, { schema });
