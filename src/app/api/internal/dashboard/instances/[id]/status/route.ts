import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { instanceStatusSnapshots } from "@/db/schema";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);

  const instanceId = Number((await params).id);
  if (!Number.isFinite(instanceId)) return fail("Invalid id", 400);

  const latest = db
    .select()
    .from(instanceStatusSnapshots)
    .where(eq(instanceStatusSnapshots.instanceId, instanceId))
    .orderBy(desc(instanceStatusSnapshots.createdAt))
    .get();

  return ok(latest ?? null);
}
