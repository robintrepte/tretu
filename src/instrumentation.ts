export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { ORCHESTRATOR_EMBEDDED } = await import("@/lib/env/server");
  if (!ORCHESTRATOR_EMBEDDED) return;

  const { startWorker } = await import("@/lib/orchestrator/worker");
  startWorker();
}
