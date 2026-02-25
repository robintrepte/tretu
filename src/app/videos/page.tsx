import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PageTitle } from "@/components/page-title";
import { pageMetadata } from "@/lib/metadata";

const YouTubeVideoGrid = dynamic(
  () => import("@/components/youtube-video-grid").then((m) => ({ default: m.YouTubeVideoGrid })),
  {
    loading: () => (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-video w-full animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    ),
  }
);

export const metadata: Metadata = pageMetadata({
  title: "YouTube Videos",
  description:
    "YouTube-Videos der Tretu Gaming Community. Let's Plays, Stream-Highlights, Events und Gaming-Content.",
  path: "/videos",
  keywords: ["YouTube", "Videos", "Tretu", "Gaming", "Stream Highlights"],
});

export default function VideosPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <PageTitle title="YouTube Videos" icon="youtube" />
      <div>
        <YouTubeVideoGrid />
      </div>
    </div>
  );
}
