import { sql } from "drizzle-orm";

import { db } from "@/db";
import packageJson from "../../package.json";

export const APP_ID = "tretu-web";

export type HealthReport = {
  status: "ok" | "error";
  app: string;
  version: string;
  time: string;
  checks: { db: "ok" | "error" };
};

async function checkDatabase(timeoutMs: number): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs).unref?.());
  const query = db.execute(sql`select 1`).then(
    () => true,
    () => false
  );
  return Promise.race([query, timeout]);
}

/** Contract §0: `{status, app, version, time, checks:{db}}` – no secrets, no error details. */
export async function healthReport(timeoutMs = 3000): Promise<HealthReport> {
  const dbOk = await checkDatabase(timeoutMs);
  return {
    status: dbOk ? "ok" : "error",
    app: APP_ID,
    version: packageJson.version,
    time: new Date().toISOString(),
    checks: { db: dbOk ? "ok" : "error" },
  };
}
