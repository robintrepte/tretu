import { runTsRankTick } from "@/lib/teamspeak/rank-worker";
import { getTsRankConfig } from "@/lib/env/server";
import { log } from "@/lib/observability/logger";

async function main() {
  const config = getTsRankConfig();
  if (!config.enabled) {
    console.error(
      "TS rank worker disabled: set TS_QUERY_HOST, TS_QUERY_USER, TS_QUERY_PASSWORD in .env.local"
    );
    // EX_CONFIG: PM2 treats this exit code as final (stop_exit_codes) instead of restarting in a loop.
    process.exit(78);
  }

  log("info", "ts-rank-worker.started", { pollIntervalSec: config.pollIntervalSec });

  while (true) {
    try {
      const result = await runTsRankTick();
      if (result) {
        log("info", "ts-rank-worker.tick.ok", {
          online: result.online,
        });
      }
    } catch (error) {
      log("error", "ts-rank-worker.tick.failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalSec * 1000));
  }
}

void main();
