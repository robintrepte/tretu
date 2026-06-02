import { getTsRankConfig } from "@/lib/env/server";
import { formatQueryProbeHelp, probeTeamSpeakQuery } from "@/lib/teamspeak/query-probe";

async function main() {
  const config = getTsRankConfig();
  if (!config.enabled) {
    console.error("Set TS_QUERY_HOST, TS_QUERY_USER, TS_QUERY_PASSWORD in .env.local");
    process.exit(1);
  }

  console.log(`Probing ${config.queryHost}:${config.queryPort} …`);
  const result = await probeTeamSpeakQuery(config.queryHost, config.queryPort);

  if (result.ok) {
    console.log("OK — ServerQuery accepts connections from this machine.");
    console.log("Banner preview:", result.banner);
    process.exit(0);
  }

  console.error("FAILED:", result.detail);
  console.error("\n" + formatQueryProbeHelp(config.queryHost, config.queryPort));
  process.exit(1);
}

void main();
