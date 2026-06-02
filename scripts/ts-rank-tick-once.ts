import { runTsRankTick } from "@/lib/teamspeak/rank-worker";

void runTsRankTick().then((result) => {
  console.log(result ?? "tick skipped (disabled or misconfigured)");
});
