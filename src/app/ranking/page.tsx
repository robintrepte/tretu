import type { Metadata } from "next";

import { PageTitle } from "@/components/page-title";
import { RankingLeaderboard } from "@/components/teamspeak-ranking/ranking-leaderboard";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Teamspeak Ranking",
  description:
    "Teamspeak-Ranking und Statistiken der Tretu Gaming Community. Monatliche Aktivitäts-Rangliste und Stimmzeit-Statistiken.",
  path: "/ranking",
  keywords: ["Teamspeak", "Ranking", "Stats", "Tretu", "Gaming Community"],
});

export default function RankingPage() {
  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px] space-y-10">
        <PageTitle title="Teamspeak Ranking" icon="ranking" />
        <RankingLeaderboard />
      </div>
    </div>
  );
}
