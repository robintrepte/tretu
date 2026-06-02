import { eq } from "drizzle-orm";

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

const nickname = process.argv[2];
if (!nickname) {
  console.error("Usage: sync-ts-user-groups.ts <nickname>");
  process.exit(1);
}

async function main() {
  const [user] = await db
    .select()
    .from(tsUsers)
    .where(eq(tsUsers.nickname, nickname))
    .limit(1);

  if (!user) {
    console.error(`User not found: ${nickname}`);
    process.exit(1);
  }

  const config = getTsRankConfig();
  if (!config.enabled) {
    console.error("TS rank not configured");
    process.exit(1);
  }

  const all = await loadRankTiersFromDb();
  const levelTiers = getLevelTiers(all);
  const prestigeTiers = getPrestigeTiers(all);
  const { tier } = resolveLevelFromCycleSeconds(
    levelTiers,
    user.cycleOnlineSeconds ?? 0
  );

  const query = new TeamSpeakQueryClient({
    host: config.queryHost,
    queryPort: config.queryPort,
    username: config.queryUser,
    password: config.queryPassword,
    virtualServerPort: config.virtualServerPort,
  });

  await query.connect();
  const result = await syncUserRankGroups({
    query,
    clientDatabaseId: user.clientDbId,
    uuid: user.uuid,
    prestige: user.prestige ?? 0,
    levelTier: tier,
    levelTiers,
    prestigeTiers,
  });
  await query.disconnect();

  console.log({
    nickname: user.nickname,
    level: user.currentLevel,
    ...result,
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
