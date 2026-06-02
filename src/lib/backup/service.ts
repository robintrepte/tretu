import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { backups, gameInstances, infraServers } from "@/db/schema";
import { hetznerClient } from "@/lib/hetzner/client";

export async function createSnapshotBackup(instanceId: number, userId: number) {
  const instance = db.select().from(gameInstances).where(eq(gameInstances.id, instanceId)).get();
  if (!instance) throw new Error("Instance not found");

  const server = db
    .select()
    .from(infraServers)
    .where(and(eq(infraServers.instanceId, instance.id), isNull(infraServers.deletedAt)))
    .get();
  if (!server) throw new Error("No active host");

  const snapshot = await hetznerClient.createSnapshot(server.hetznerServerId, `${instance.slug}-${Date.now()}`);
  db.insert(backups)
    .values({
      instanceId: instance.id,
      hetznerSnapshotId: String(snapshot.action.id),
      kind: "manual",
      createdByUserId: userId,
    })
    .run();
}

export function latestBackup(instanceId: number) {
  return db.select().from(backups).where(eq(backups.instanceId, instanceId)).orderBy(desc(backups.createdAt)).get();
}
