import { runOrchestratorTick } from "@/lib/orchestrator/runner";
import { log } from "@/lib/observability/logger";
import { seedDefaultRoles } from "@/lib/permissions/checks";

async function main() {
  seedDefaultRoles();
  log("info", "orchestrator.started");
  while (true) {
    try {
      await runOrchestratorTick();
    } catch (error) {
      log("error", "orchestrator.tick.failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

void main();
