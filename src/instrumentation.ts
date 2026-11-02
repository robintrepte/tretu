export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Fail fast instead of signing sessions with the development fallback secret.
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";
    if (secret.length < 32) {
      throw new Error("AUTH_SECRET (or BETTER_AUTH_SECRET) must be set to at least 32 random characters in production.");
    }
  }

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
