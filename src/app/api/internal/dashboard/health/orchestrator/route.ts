import { requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { workerHeartbeat } from "@/lib/orchestrator/worker";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  return ok(workerHeartbeat());
}
