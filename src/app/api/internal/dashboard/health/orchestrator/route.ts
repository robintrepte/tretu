import { desc } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs } from "@/db/schema";
import { ok } from "@/lib/api/respond";

export async function GET() {
  const latest = db.select().from(actionJobs).orderBy(desc(actionJobs.createdAt)).get();
  return ok({
    healthy: true,
    latestActionAt: latest?.createdAt ?? null,
  });
}
