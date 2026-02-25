import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PageTitle } from "@/components/page-title";
import { pageMetadata } from "@/lib/metadata";

const DiscordWidget = dynamic(
  () => import("@/components/discord-widget").then((m) => ({ default: m.DiscordWidget })),
  { loading: () => <div className="min-h-[400px] w-full animate-pulse rounded-lg bg-muted/30" /> }
);

export const metadata: Metadata = pageMetadata({
  title: "Discord",
  description:
    "Tretu Discord-Server. Trete der Community bei, chatte mit anderen Gamern und bleib bei Events und News auf dem Laufenden.",
  path: "/discord",
  keywords: ["Discord", "Tretu", "Gaming Community", "Chat", "Server"],
});

export default function DiscordPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <PageTitle title="Discord" icon="discord" />
      <div>
        <DiscordWidget />
      </div>
    </div>
  );
}
