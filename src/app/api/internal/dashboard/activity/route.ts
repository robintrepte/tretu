import { desc } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, auditEvents } from "@/db/schema";
import { requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("roles:manage");
  if (guard.error) return guard.error;
  const jobs = db
    .select({
      id: actionJobs.id,
      instanceId: actionJobs.instanceId,
      actionType: actionJobs.actionType,
      status: actionJobs.status,
      error: actionJobs.error,
      createdAt: actionJobs.createdAt,
    })
    .from(actionJobs)
    .orderBy(desc(actionJobs.createdAt))
    .limit(100)
    .all();
  const events = db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100).all();
  return ok({ jobs, events });
}
