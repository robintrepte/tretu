export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { ORCHESTRATOR_EMBEDDED } = await import("@/lib/env/server");
  if (!ORCHESTRATOR_EMBEDDED) return;

  try {
    const { startWorker } = await import("@/lib/orchestrator/worker");
    startWorker();
  } catch (error) {
    // Never take the website down because of the dashboard worker (e.g. DB not migrated yet).
    console.error("[orchestrator] worker not started:", error instanceof Error ? error.message : error);
  }
}
