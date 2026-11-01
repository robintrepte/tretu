import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EmbedGate } from "@/components/embed-gate";
import { PageTitle } from "@/components/page-title";
import { translatedMetadata } from "@/lib/metadata";

const TeamspeakViewer = dynamic(
  () => import("@/components/teamspeak-viewer").then((m) => ({ default: m.TeamspeakViewer })),
  { loading: () => <div className="min-h-[200px] w-full animate-pulse rounded-lg bg-muted/30" /> }
);

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("teamspeak", "/teamspeak", { keywords: ["Teamspeak", "Tretu", "Voice Chat", "Gaming", "Server"] });
}

export default function TeamspeakPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <PageTitle title="Teamspeak" icon="teamspeak" />
      <div>
        <EmbedGate provider="tsviewer" minHeight={200}>
          <TeamspeakViewer />
        </EmbedGate>
      </div>
    </div>
  );
}
