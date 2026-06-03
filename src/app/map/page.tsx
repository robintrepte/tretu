import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { pageMetadata } from "@/lib/metadata";
import { isMinecraftMapAvailable } from "@/lib/map/availability";
import { MINECRAFT_MAP_URL } from "@/lib/map/url";

export const metadata: Metadata = pageMetadata({
  title: "Minecraft Map",
  description:
    "Interaktive Minecraft-Map der Tretu Gaming Community. Erkunde die Welt, Server-Karte und Spielerpositionen in Echtzeit.",
  path: "/map",
  keywords: ["Minecraft", "Map", "Tretu", "Gaming", "Server", "Community"],
});

export default async function MinecraftMapPage() {
  const mapAvailable = await isMinecraftMapAvailable();

  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <PageTitle title="Minecraft Map" icon="map" />
      </div>
      {mapAvailable ? (
        <iframe
          src={MINECRAFT_MAP_URL}
          width="100%"
          height={800}
          title="Minecraft Map"
          className="min-h-[500px] w-full rounded-lg border-0"
          loading="lazy"
        />
      ) : (
        <p className="mx-auto max-w-[1200px] text-center text-muted-foreground">
          Die Karte ist gerade nicht erreichbar. Bitte später erneut versuchen.
        </p>
      )}
    </div>
  );
}
