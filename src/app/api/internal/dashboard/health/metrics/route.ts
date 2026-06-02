import { desc } from "drizzle-orm";

import { db } from "@/db";
import { instanceStatusSnapshots } from "@/db/schema";
import { ok } from "@/lib/api/respond";

export async function GET() {
  const latest = db.select().from(instanceStatusSnapshots).orderBy(desc(instanceStatusSnapshots.createdAt)).get();
  return ok({
    healthy: true,
    latestMetricsAt: latest?.createdAt ?? null,
  });
}
