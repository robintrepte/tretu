import { eq } from "drizzle-orm";

import { db } from "@/db";
import { tsUsers } from "@/db/schema";
import { RANKSYSTEM_SQL_DUMP } from "@/lib/env/server";
import {
  getLevelTiers,
  getPrestigeTiers,
  totalSecondsToPrestigeProgress,
} from "@/lib/teamspeak/prestige-progress";
import { seedRankTiersFromDump } from "@/lib/teamspeak/import-ranksystem";

async function main() {
  const dumpPath = process.argv.includes("--dump")
    ? process.argv[process.argv.indexOf("--dump") + 1]
    : RANKSYSTEM_SQL_DUMP;

  if (!dumpPath) {
    throw new Error("Missing dump path");
  }

  console.log("Reseeding tiers from", dumpPath);
  const tiers = await seedRankTiersFromDump(dumpPath);
  const levelTiers = getLevelTiers(tiers);
  const prestigeTiers = getPrestigeTiers(tiers);

  const users = await db.select().from(tsUsers);
  let updated = 0;

  for (const user of users) {
    const progress = totalSecondsToPrestigeProgress(
      user.totalOnlineSeconds,
      levelTiers,
      prestigeTiers
    );

    await db
      .update(tsUsers)
      .set({
        prestige: progress.prestige,
        cycleOnlineSeconds: progress.cycleOnlineSeconds,
        currentLevel: progress.level,
        currentTierId: progress.levelTier?.id ?? null,
        assignedServerGroupId: progress.levelTier?.serverGroupId ?? user.assignedServerGroupId,
        assignedPrestigeGroupId:
          progress.prestigeTier?.serverGroupId ?? user.assignedPrestigeGroupId,
        updatedAt: new Date(),
      })
      .where(eq(tsUsers.uuid, user.uuid));

    updated++;
  }

  console.log(JSON.stringify({ tiers: tiers.length, usersUpdated: updated }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
