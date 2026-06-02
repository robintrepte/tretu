import path from "node:path";

import { importRanksystemFromDump } from "@/lib/teamspeak/import-ranksystem";
import { RANKSYSTEM_SQL_DUMP } from "@/lib/env/server";

function parseArgs(argv: string[]) {
  let dumpPath = RANKSYSTEM_SQL_DUMP;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--dump" && argv[i + 1]) {
      dumpPath = argv[i + 1]!;
      i++;
    }
  }

  return { dumpPath: path.resolve(dumpPath), dryRun };
}

async function main() {
  const { dumpPath, dryRun } = parseArgs(process.argv.slice(2));
  console.log(`Importing from ${dumpPath}${dryRun ? " (dry-run)" : ""}...`);

  const result = await importRanksystemFromDump(dumpPath, { dryRun });
  console.log(
    JSON.stringify(
      {
        tiers: result.tiers,
        levelTiers: result.levelTiers,
        prestigeTiers: result.prestigeTiers,
        users: result.users,
        skipped: result.skipped,
        dryRun,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
