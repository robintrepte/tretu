import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
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
      <div className="mx-auto max-w-[1200px]">
        <PageTitle title="Teamspeak Ranking" icon="ranking" />
      </div>
      <iframe
        src="https://ranks.tretu.de/stats/top_month.php"
        width="100%"
        height={2000}
        title="Teamspeak Ranking"
        className="min-h-[500px] w-full rounded-lg border-0"
        loading="lazy"
      />
    </div>
  );
}
