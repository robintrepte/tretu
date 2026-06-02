import { eq } from "drizzle-orm";

import { db } from "@/db";
import { tsUsers } from "@/db/schema";
import { normalizeTsUuid } from "@/lib/teamspeak/query-escape";

type TsUserRow = typeof tsUsers.$inferSelect;

function pickKeeper(rows: TsUserRow[]): TsUserRow {
  return rows.reduce((best, row) => {
    if ((row.totalOnlineSeconds ?? 0) > (best.totalOnlineSeconds ?? 0)) return row;
    if ((row.totalOnlineSeconds ?? 0) < (best.totalOnlineSeconds ?? 0)) return best;
    if ((row.currentLevel ?? 0) > (best.currentLevel ?? 0)) return row;
    return best;
  });
}

function mergeRows(keeper: TsUserRow, row: TsUserRow): TsUserRow {
  return {
    ...keeper,
    uuid: normalizeTsUuid(keeper.uuid),
    clientDbId: Math.max(keeper.clientDbId ?? 0, row.clientDbId ?? 0) || keeper.clientDbId,
    nickname: keeper.nickname || row.nickname,
    totalOnlineSeconds: Math.max(
      keeper.totalOnlineSeconds ?? 0,
      row.totalOnlineSeconds ?? 0
    ),
    cycleOnlineSeconds: Math.max(
      keeper.cycleOnlineSeconds ?? 0,
      row.cycleOnlineSeconds ?? 0
    ),
    prestige: Math.max(keeper.prestige ?? 0, row.prestige ?? 0),
    currentLevel: Math.max(keeper.currentLevel ?? 0, row.currentLevel ?? 0),
    periodOnlineSeconds: Math.max(
      keeper.periodOnlineSeconds ?? 0,
      row.periodOnlineSeconds ?? 0
    ),
    weekOnlineSeconds: Math.max(keeper.weekOnlineSeconds ?? 0, row.weekOnlineSeconds ?? 0),
    yearOnlineSeconds: Math.max(keeper.yearOnlineSeconds ?? 0, row.yearOnlineSeconds ?? 0),
    isOnline: keeper.isOnline || row.isOnline,
    lastSeenAt:
      (keeper.lastSeenAt?.getTime() ?? 0) > (row.lastSeenAt?.getTime() ?? 0)
        ? keeper.lastSeenAt
        : row.lastSeenAt,
    updatedAt: new Date(),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const all = await db.select().from(tsUsers);

  const byKey = new Map<string, TsUserRow[]>();
  for (const row of all) {
    const key =
      row.clientDbId && row.clientDbId > 0
        ? `db:${row.clientDbId}`
        : `uuid:${normalizeTsUuid(row.uuid)}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  let merged = 0;
  let removed = 0;

  for (const [, rows] of byKey) {
    if (rows.length < 2) continue;

    let keeper = pickKeeper(rows);
    for (const row of rows) {
      if (row.uuid === keeper.uuid) continue;
      keeper = mergeRows(keeper, row);
    }

    const deleteUuids = rows.map((r) => r.uuid).filter((uuid) => uuid !== keeper.uuid);

    console.log({
      nickname: keeper.nickname,
      level: keeper.currentLevel,
      keeperUuid: keeper.uuid,
      delete: deleteUuids,
    });

    if (!dryRun) {
      for (const uuid of deleteUuids) {
        await db.delete(tsUsers).where(eq(tsUsers.uuid, uuid));
      }
      await db
        .insert(tsUsers)
        .values(keeper)
        .onConflictDoUpdate({
          target: tsUsers.uuid,
          set: {
            clientDbId: keeper.clientDbId,
            nickname: keeper.nickname,
            totalOnlineSeconds: keeper.totalOnlineSeconds,
            cycleOnlineSeconds: keeper.cycleOnlineSeconds,
            prestige: keeper.prestige,
            currentLevel: keeper.currentLevel,
            periodOnlineSeconds: keeper.periodOnlineSeconds,
            weekOnlineSeconds: keeper.weekOnlineSeconds,
            yearOnlineSeconds: keeper.yearOnlineSeconds,
            isOnline: keeper.isOnline,
            lastSeenAt: keeper.lastSeenAt,
            updatedAt: keeper.updatedAt,
          },
        });
    }

    merged += 1;
    removed += deleteUuids.length;
  }

  console.log(JSON.stringify({ merged, removed, dryRun }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
