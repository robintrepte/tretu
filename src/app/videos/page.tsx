import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PageTitle } from "@/components/page-title";
import { translatedMetadata } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";

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

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("videos", "/videos", { keywords: ["YouTube", "Videos", "Tretu", "Gaming", "Stream Highlights"] });
}

export default async function VideosPage() {
  const t = await getTranslations("videos");
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <PageTitle title={t("title")} icon="youtube" />
      <div>
        <YouTubeVideoGrid />
      </div>
    </div>
  );
}
