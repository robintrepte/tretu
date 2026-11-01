import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EmbedGate } from "@/components/embed-gate";
import { PageTitle } from "@/components/page-title";
import { translatedMetadata } from "@/lib/metadata";

const TwitchEmbed = dynamic(
  () => import("@/components/twitch-embed").then((m) => ({ default: m.TwitchEmbed })),
  { loading: () => <div className="h-[800px] w-full animate-pulse rounded-lg bg-muted/30" /> }
);

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("live", "/live", { keywords: ["Livestream", "Twitch", "Tretu", "Gaming", "Stream"] });
}

export default function LivestreamPage() {
  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <PageTitle title="Livestream" icon="twitch" />
      </div>
      <EmbedGate provider="twitch" minHeight={500}>
        <TwitchEmbed />
      </EmbedGate>
    </div>
  );
}
