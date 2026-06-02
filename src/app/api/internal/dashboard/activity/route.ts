import { desc } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, auditEvents } from "@/db/schema";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasRole } from "@/lib/permissions/checks";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasRole(userId, "admin")) return fail("Forbidden", 403);

  const jobs = db.select().from(actionJobs).orderBy(desc(actionJobs.createdAt)).limit(100).all();
  const events = db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100).all();

  return ok({ jobs, events });
}
