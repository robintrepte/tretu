// Node.js-only startup work, loaded from instrumentation.ts behind the NEXT_RUNTIME guard so the Edge bundle never sees it.
export async function registerNode() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (process.env.NODE_ENV === "production") {
    try {
      // Fail fast instead of signing sessions with the development fallback secret.
      const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";
      if (secret.length < 32) {
        throw new Error("AUTH_SECRET (or BETTER_AUTH_SECRET) must be set to at least 32 random characters in production.");
      }
      // The Tretu-Konto is the only sign-in: no issuer/client, no start (development shows a notice on /login instead).
      const { assertTretuAuthConfigured } = await import("@/lib/auth/config");
      assertTretuAuthConfigured();
    } catch (error) {
      // Next.js would keep running and answer every request with 500: stop, so PM2 and the logs show why.
      console.error(`[startup] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
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
