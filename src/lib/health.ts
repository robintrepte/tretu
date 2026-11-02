import { sql } from "drizzle-orm";

import { db } from "@/db";
import packageJson from "../../package.json";
import migrationJournal from "../../drizzle/meta/_journal.json";

export const APP_ID = "tretu-web";

/** Pending work older than this means the platform worker (PM2 `tretu-platform-worker`) is not running. */
export const WORKER_OVERDUE_MINUTES = 10;

export type HealthReport = {
  status: "ok" | "error";
  app: string;
  version: string;
  time: string;
  checks: {
    db: "ok" | "error";
    /** All migrations in `drizzle/` applied (a deploy that skipped `npm run db:migrate` fails here). */
    migrations: "ok" | "pending" | "error";
    /**
     * Platform worker: `off` without TRETU_APPS_JSON, `stale` when webhooks/jobs are overdue. Informational
     * (does not turn `status` into an error: the site itself works); /status shows when its checks stop.
     */
    worker: "ok" | "stale" | "off" | "error";
  };
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs).unref?.());
  return Promise.race([promise.catch(() => fallback), timeout]);
}

async function checkDatabase(): Promise<boolean> {
  await db.execute(sql`select 1`);
  return true;
}

async function checkMigrations(): Promise<"ok" | "pending"> {
  const rows = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
  const applied = Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
  return applied >= migrationJournal.entries.length ? "ok" : "pending";
}

async function checkWorker(): Promise<"ok" | "stale" | "off"> {
  if (!process.env.TRETU_APPS_JSON?.trim()) return "off";
  const minutes = WORKER_OVERDUE_MINUTES;
  const rows = await db.execute(sql`
    select (
      exists (select 1 from platform_outbox where status = 'pending'
              and next_attempt_at < now() - make_interval(mins => ${minutes})
              and (locked_until is null or locked_until < now()))
      or exists (select 1 from platform_jobs where status = 'pending'
              and next_attempt_at < now() - make_interval(mins => ${minutes})
              and (locked_until is null or locked_until < now()))
    ) as overdue`);
  return (rows as unknown as { overdue: boolean }[])[0]?.overdue ? "stale" : "ok";
}

/** Contract §0: `{status, app, version, time, checks:{db,…}}` – no secrets, no error details. */
export async function healthReport(timeoutMs = 3000): Promise<HealthReport> {
  const dbOk = await withTimeout(checkDatabase(), timeoutMs, false);
  const migrations = dbOk ? await withTimeout(checkMigrations(), timeoutMs, "error" as const) : ("error" as const);
  const worker = dbOk ? await withTimeout(checkWorker(), timeoutMs, "error" as const) : ("error" as const);
  const ok = dbOk && migrations === "ok";
  return {
    status: ok ? "ok" : "error",
    app: APP_ID,
    version: packageJson.version,
    time: new Date().toISOString(),
    checks: { db: dbOk ? "ok" : "error", migrations, worker },
  };
}
