import { like } from "drizzle-orm";
import { db } from "@/db";
import { tsRankTiers, tsUsers } from "@/db/schema";

async function main() {
const nick = process.argv[2] ?? "Chris";
const rows = await db
  .select()
  .from(tsUsers)
  .where(like(tsUsers.nickname, `%${nick}%`))
  .limit(5);

for (const r of rows) {
  console.log({
    uuid: r.uuid,
    clientDbId: r.clientDbId,
    nickname: r.nickname,
    level: r.currentLevel,
    prestige: r.prestige,
    total: r.totalOnlineSeconds,
    cycle: r.cycleOnlineSeconds,
    assigned: r.assignedServerGroupId,
    tierId: r.currentTierId,
    isOnline: r.isOnline,
  });
}
}

void main();
