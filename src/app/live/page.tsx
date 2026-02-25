import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PageTitle } from "@/components/page-title";
import { pageMetadata } from "@/lib/metadata";

const TwitchEmbed = dynamic(
  () => import("@/components/twitch-embed").then((m) => ({ default: m.TwitchEmbed })),
  { loading: () => <div className="h-[800px] w-full animate-pulse rounded-lg bg-muted/30" /> }
);

export const metadata: Metadata = pageMetadata({
  title: "Livestream",
  description:
    "Schau den offiziellen Tretu Livestream auf Twitch. Gaming-Streams, Events und Community-Aktivitäten live verfolgen.",
  path: "/live",
  keywords: ["Livestream", "Twitch", "Tretu", "Gaming", "Stream"],
});

export default function LivestreamPage() {
  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <PageTitle title="Livestream" icon="twitch" />
      </div>
      <TwitchEmbed />
    </div>
  );
}
