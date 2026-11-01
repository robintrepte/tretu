/**
 * Tretu platform worker (PM2: tretu-platform-worker). Needs DATABASE_URL; everything else is optional.
 *   npm run platform:worker            # loop
 *   npm run platform:worker -- --once  # one pass of everything, then exit
 */
import { log } from "@/lib/observability/logger";
import { closePlatformDb, isPlatformDbConfigured } from "@/lib/platform/db";
import { runDeliveryTick, runMaintenanceTick, runPresenceTick } from "@/lib/platform/worker";

const DELIVERY_IDLE_MS = 2000;
const PRESENCE_EVERY_MS = 30_000;
const MAINTENANCE_EVERY_MS = 10 * 60_000;

let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function safe(name: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    log("error", "platform.worker.failed", { task: name, error: error instanceof Error ? error.message : String(error) });
  }
}

async function main(): Promise<void> {
  if (!isPlatformDbConfigured()) {
    console.error("platform worker disabled: set DATABASE_URL");
    process.exit(1);
  }
  const once = process.argv.includes("--once");
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopping = true;
    });
  }
  log("info", "platform.worker.started", { once });

  let lastPresence = 0;
  let lastMaintenance = 0;
  while (!stopping) {
    let work = 0;
    await safe("delivery", async () => {
      work = await runDeliveryTick();
    });
    const now = Date.now();
    if (once || now - lastPresence >= PRESENCE_EVERY_MS) {
      lastPresence = now;
      await safe("presence", runPresenceTick);
    }
    if (once || now - lastMaintenance >= MAINTENANCE_EVERY_MS) {
      lastMaintenance = now;
      await safe("maintenance", runMaintenanceTick);
    }
    if (once) break;
    if (work === 0) await sleep(DELIVERY_IDLE_MS);
  }
  await closePlatformDb();
  log("info", "platform.worker.stopped", {});
}

void main();
