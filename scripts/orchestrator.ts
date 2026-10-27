import { startWorker } from "@/lib/orchestrator/worker";

// Standalone worker; set ORCHESTRATOR_EMBEDDED=false for the Next.js server when using this.
startWorker();
setInterval(() => undefined, 1 << 30);
