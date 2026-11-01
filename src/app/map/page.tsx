import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { translatedMetadata } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";
import { isMinecraftMapAvailable } from "@/lib/map/availability";
import { MINECRAFT_MAP_URL } from "@/lib/map/url";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("map", "/map", { keywords: ["Minecraft", "Map", "Tretu", "Gaming", "Server", "Community"] });
}

export default async function MinecraftMapPage() {
  const mapAvailable = await isMinecraftMapAvailable();
  const t = await getTranslations("map");

  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <PageTitle title={t("title")} icon="map" />
      </div>
      {mapAvailable ? (
        <iframe
          src={MINECRAFT_MAP_URL}
          width="100%"
          height={800}
          title={t("title")}
          className="min-h-[500px] w-full rounded-lg border-0"
          loading="lazy"
        />
      ) : (
        <p className="mx-auto max-w-[1200px] text-center text-muted-foreground">
          {t("unavailable")}
        </p>
      )}
    </div>
  );
}
