import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { tsUsers } from "@/db/schema";
import { getTsRankConfig } from "@/lib/env/server";
import {
  getLevelTiers,
  getPrestigeTiers,
  resolveLevelFromCycleSeconds,
} from "@/lib/teamspeak/prestige-progress";
import { TeamSpeakQueryClient } from "@/lib/teamspeak/query-client";
import { loadRankTiersFromDb } from "@/lib/teamspeak/ranks";
import { syncUserRankGroups } from "@/lib/teamspeak/rank-sync";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const delayMs = Number(process.env.TS_RESYNC_DELAY_MS ?? 200);
  const config = getTsRankConfig();
  if (!config.enabled) {
    console.error(
      "TS rank worker not configured. Set TS_QUERY_HOST, TS_QUERY_USER, and TS_QUERY_PASSWORD in .env.local."
    );
    process.exit(1);
  }

  const allTiers = await loadRankTiersFromDb();
  const levelTiers = getLevelTiers(allTiers);
  const prestigeTiers = getPrestigeTiers(allTiers);

  const users = await db
    .select()
    .from(tsUsers)
    .where(and(eq(tsUsers.excepted, false), gt(tsUsers.clientDbId, 0)));

  const query = new TeamSpeakQueryClient({
    host: config.queryHost,
    queryPort: config.queryPort,
    username: config.queryUser,
    password: config.queryPassword,
    virtualServerPort: config.virtualServerPort,
  });

  console.log(
    `Resyncing ${users.length} users (stop worker:ts-rank first if it is running).`
  );

  await query.connect();

  let synced = 0;
  let failed = 0;
  const startFrom = Number(process.env.TS_RESYNC_START_AT ?? 0);

  for (let i = startFrom; i < users.length; i++) {
    const user = users[i]!;
    const { tier: levelTier } = resolveLevelFromCycleSeconds(
      levelTiers,
      user.cycleOnlineSeconds ?? 0
    );

    try {
      await syncUserRankGroups({
        query,
        clientDatabaseId: user.clientDbId,
        uuid: user.uuid,
        prestige: user.prestige ?? 0,
        levelTier: levelTier ?? null,
        levelTiers,
        prestigeTiers,
      });
      synced += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${i + 1}/${users.length}] ${user.nickname}: ${message}`);
      if (message.toLowerCase().includes("connection closed")) {
        console.error(
          `Resume with: TS_RESYNC_START_AT=${i} npm run ts:resync-rank-groups`
        );
        break;
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(`Progress ${i + 1}/${users.length} (ok=${synced}, failed=${failed})`);
    }
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  await query.disconnect();
  console.log(JSON.stringify({ synced, failed, total: users.length }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
