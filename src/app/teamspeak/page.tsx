import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PageTitle } from "@/components/page-title";
import { pageMetadata } from "@/lib/metadata";

const TeamspeakViewer = dynamic(
  () => import("@/components/teamspeak-viewer").then((m) => ({ default: m.TeamspeakViewer })),
  { loading: () => <div className="min-h-[200px] w-full animate-pulse rounded-lg bg-muted/30" /> }
);

export const metadata: Metadata = pageMetadata({
  title: "Teamspeak",
  description:
    "Tretu Teamspeak-Server. Voice-Chat mit der Community, Kanäle und aktuelle Nutzer online. Verbinde dich mit dem Teamspeak-Server.",
  path: "/teamspeak",
  keywords: ["Teamspeak", "Tretu", "Voice Chat", "Gaming", "Server"],
});

export default function TeamspeakPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <PageTitle title="Teamspeak" icon="teamspeak" />
      <div>
        <TeamspeakViewer />
      </div>
    </div>
  );
}
