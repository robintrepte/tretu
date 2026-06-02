import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { refreshMetricsForInstance } from "@/lib/metrics/poller";
import { hasPermission } from "@/lib/permissions/checks";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);

  const instanceId = Number((await params).id);
  if (!Number.isFinite(instanceId)) return fail("Invalid id", 400);

  await refreshMetricsForInstance(instanceId);
  return ok({ refreshed: true });
}
