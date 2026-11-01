import type { Metadata } from "next";

import { PageTitle } from "@/components/page-title";
import { RankingLeaderboard } from "@/components/teamspeak-ranking/ranking-leaderboard";
import { translatedMetadata } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("ranking", "/ranking", { keywords: ["Teamspeak", "Ranking", "Stats", "Tretu", "Gaming Community"] });
}

export default async function RankingPage() {
  const t = await getTranslations("ranking");
  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px] space-y-10">
        <PageTitle title={t("title")} icon="ranking" />
        <RankingLeaderboard />
      </div>
    </div>
  );
}
