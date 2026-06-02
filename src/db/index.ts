import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

import { SQLITE_DATABASE_PATH } from "@/lib/env/server";
import * as schema from "./schema";

const sqlite = new Database(SQLITE_DATABASE_PATH);
export const db = drizzle(sqlite, { schema });
