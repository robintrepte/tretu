import { eq } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances, instanceStatusSnapshots } from "@/db/schema";
import { getGameAdapter } from "@/lib/games";

export async function refreshMetricsForInstance(instanceId: number) {
  const instance = db.select().from(gameInstances).where(eq(gameInstances.id, instanceId)).get();
  if (!instance) return;

  const adapter = getGameAdapter(instance.gameType);
  const status = await adapter.fetchLiveStatus({
    instanceId: instance.id,
    mountPath: `/srv/tretu/${instance.slug}`,
  });

  db.insert(instanceStatusSnapshots)
    .values({
      instanceId: instance.id,
      infraStatus: status.infraStatus,
      gameStatus: status.gameStatus,
      playerCount: status.playerCount,
      maxPlayers: status.maxPlayers,
      lastHeartbeatAt: new Date(),
      rawJson: status,
    })
    .run();
}
