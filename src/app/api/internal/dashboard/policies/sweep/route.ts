import { and, eq, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, gameInstances, infraServers } from "@/db/schema";
import { ok } from "@/lib/api/respond";

export async function POST() {
  const instances = db
    .select()
    .from(gameInstances)
    .where(and(isNull(gameInstances.archivedAt), lte(gameInstances.idleDeleteAfterMinutes, 10_080)))
    .all();

  let queued = 0;
  for (const instance of instances) {
    const activeServer = db
      .select()
      .from(infraServers)
      .where(and(eq(infraServers.instanceId, instance.id), isNull(infraServers.deletedAt)))
      .get();
    if (!activeServer) continue;

    db.insert(actionJobs)
      .values({
        instanceId: instance.id,
        actionType: "deleteHost",
        requestedByUserId: 1,
        payloadJson: { reason: "idle-policy" },
        status: "queued",
        idempotencyKey: `sweep-${instance.id}-${Date.now()}`,
      })
      .run();
    queued += 1;
  }

  return ok({ queued });
}
