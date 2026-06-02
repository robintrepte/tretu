import { eq } from "drizzle-orm";

import { db } from "@/db";
import { tsServerSnapshots, tsUsers, tsWorkerState } from "@/db/schema";
import { getTsRankConfig, SQLITE_DATABASE_PATH } from "@/lib/env/server";
import { formatQueryProbeHelp, probeTeamSpeakQuery } from "@/lib/teamspeak/query-probe";
import { TeamSpeakQueryClient } from "@/lib/teamspeak/query-client";
import { loadRankTiersFromDb } from "@/lib/teamspeak/ranks";

async function main() {
  const config = getTsRankConfig();
  console.log("DB:", SQLITE_DATABASE_PATH);
  console.log("TS config:", {
    enabled: config.enabled,
    host: config.queryHost,
    queryPort: config.queryPort,
    user: config.queryUser ? "(set)" : "(missing)",
    password: config.queryPassword ? "(set)" : "(missing)",
    virtualServerPort: config.virtualServerPort,
  });

  const tiers = await loadRankTiersFromDb();
  console.log("Rank tiers:", tiers.length);

  const worker = await db.select().from(tsWorkerState).where(eq(tsWorkerState.id, 1));
  console.log("Worker state:", worker[0] ?? "none");

  const onlineUsers = await db
    .select({ count: tsUsers.uuid })
    .from(tsUsers)
    .where(eq(tsUsers.isOnline, true));
  console.log("DB users marked online:", onlineUsers.length);

  const snaps = await db.select().from(tsServerSnapshots).limit(3);
  console.log("Recent snapshots:", snaps.length, snaps);

  if (!config.enabled) {
    console.error("TS rank not enabled — fix TS_QUERY_* in .env.local");
    process.exit(1);
  }

  const query = new TeamSpeakQueryClient({
    host: config.queryHost,
    queryPort: config.queryPort,
    username: config.queryUser,
    password: config.queryPassword,
    virtualServerPort: config.virtualServerPort,
  });

  console.log("Probing raw ServerQuery (before login)…");
  const probe = await probeTeamSpeakQuery(config.queryHost, config.queryPort);
  if (!probe.ok) {
    console.error("Probe failed:", probe.detail);
    console.error("\n" + formatQueryProbeHelp(config.queryHost, config.queryPort));
    process.exit(1);
  }
  console.log("Probe OK — TS3 banner received.");

  try {
    console.log("Connecting to TeamSpeak Query…");
    console.log(
      "Tip: stop worker:ts-rank first — only one ServerQuery session per account is reliable."
    );
    await query.connect();
    const clients = await query.clientList();
    const channels = await query.channelList();
    console.log("Filtered regular clients (type 0):", clients.length);
    console.log("Channels:", channels.size);
    if (clients[0]) {
      console.log("Sample client:", {
        nickname: clients[0].nickname,
        channelId: clients[0].channelId,
        idleMs: clients[0].clientIdleTimeMs,
      });
    }
    await query.disconnect();
  } catch (error) {
    console.error("Query failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
