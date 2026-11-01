import { closeDb } from "@/db";
import { runTsRankTick } from "@/lib/teamspeak/rank-worker";

void runTsRankTick()
  .finally(() => void closeDb())
  .then((result) => {
    console.log(result ?? "tick skipped (disabled or misconfigured)");
  });
