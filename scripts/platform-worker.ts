/**
 * Tretu platform worker (PM2: tretu-platform-worker). Needs DATABASE_URL; everything else is optional.
 *   npm run platform:worker            # loop
 *   npm run platform:worker -- --once  # one pass of everything, then exit
 *
 * Restart behaviour: SIGTERM/SIGINT (pm2 reload/stop) finishes the job in progress, hands every other
 * claimed job back and exits 0 within PM2's kill_timeout. Claimed work of a crashed process is picked
 * up again once its lock expires (webhooks 60 s, jobs 120 s). A failing pass (e.g. Postgres restarting)
 * is logged and retried with backoff instead of exiting; an unexpected crash exits 1 and PM2 restarts it
 * with exponential backoff. Without DATABASE_URL it exits 78, which PM2 treats as "stay stopped".
 *
 * It also runs the checks behind tretu.de/status (src/lib/status): every 60 s each service's /api/health, the
 * Minecraft and TeamSpeak servers; every hour the TLS certificates (expiry warnings on Discord).
 */
import { log } from "@/lib/observability/logger";
import { closePlatformDb, isPlatformDbConfigured } from "@/lib/platform/db";
import { runDeliveryTick, runMaintenanceTick, runPresenceTick } from "@/lib/platform/worker";
import { CERT_CHECK_EVERY_MS } from "@/lib/status/certs";
import { runCertificateTick, runStatusTick, STATUS_CHECK_EVERY_MS } from "@/lib/status/worker";

const DELIVERY_IDLE_MS = 2000;
const PRESENCE_EVERY_MS = 30_000;
const MAINTENANCE_EVERY_MS = 10 * 60_000;
const MAX_ERROR_BACKOFF_MS = 60_000;
/** Exit code for "not configured" (ecosystem.config.cjs: stop_exit_codes). */
const EXIT_NOT_CONFIGURED = 78;

let stopping = false;
let wake: (() => void) | null = null;
/** Cancels running status checks on shutdown. */
const stopChecks = new AbortController();

/** Sleeps, but wakes up immediately on shutdown. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wake = null;
      resolve();
    }, ms);
    wake = () => {
      clearTimeout(timer);
      wake = null;
      resolve();
    };
  });

async function safe(name: string, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    log("error", "platform.worker.failed", { task: name, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function main(): Promise<void> {
  if (!isPlatformDbConfigured()) {
    console.error("platform worker disabled: set DATABASE_URL");
    process.exit(EXIT_NOT_CONFIGURED);
  }
  const once = process.argv.includes("--once");
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (!stopping) log("info", "platform.worker.stopping", { signal });
      stopping = true;
      stopChecks.abort();
      wake?.();
    });
  }
  log("info", "platform.worker.started", { once });

  let lastPresence = 0;
  let lastMaintenance = 0;
  let lastStatus = 0;
  let lastCerts = 0;
  let failures = 0;
  while (!stopping) {
    let work = 0;
    const ok = await safe("delivery", async () => {
      work = await runDeliveryTick(new Date(), () => stopping);
    });
    if (stopping) break;
    const now = Date.now();
    if (once || now - lastPresence >= PRESENCE_EVERY_MS) {
      lastPresence = now;
      await safe("presence", runPresenceTick);
    }
    if (once || now - lastStatus >= STATUS_CHECK_EVERY_MS) {
      lastStatus = now;
      await safe("status", () => runStatusTick(new Date(now), { signal: stopChecks.signal }));
      if (stopping) break;
    }
    if (once || now - lastCerts >= CERT_CHECK_EVERY_MS) {
      lastCerts = now;
      await safe("certificates", () => runCertificateTick(new Date(now), { signal: stopChecks.signal }));
      if (stopping) break;
    }
    if (once || now - lastMaintenance >= MAINTENANCE_EVERY_MS) {
      lastMaintenance = now;
      await safe("maintenance", runMaintenanceTick);
    }
    if (once) break;
    failures = ok ? 0 : failures + 1;
    if (failures) await sleep(Math.min(MAX_ERROR_BACKOFF_MS, DELIVERY_IDLE_MS * 2 ** Math.min(failures, 5)));
    else if (work === 0) await sleep(DELIVERY_IDLE_MS);
  }
  await closePlatformDb();
  log("info", "platform.worker.stopped", {});
}

process.on("unhandledRejection", (reason) => {
  log("error", "platform.worker.crashed", { error: reason instanceof Error ? reason.message : String(reason) });
  process.exit(1);
});

main().catch((error: unknown) => {
  log("error", "platform.worker.crashed", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
