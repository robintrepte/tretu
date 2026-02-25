import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Minecraft Map",
  description:
    "Interaktive Minecraft-Map der Tretu Gaming Community. Erkunde die Welt, Server-Karte und Spielerpositionen in Echtzeit.",
  path: "/map",
  keywords: ["Minecraft", "Map", "Tretu", "Gaming", "Server", "Community"],
});

export default function MinecraftMapPage() {
  return (
    <div className="w-full px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <PageTitle title="Minecraft Map" icon="map" />
      </div>
      <iframe
        src="https://map.tretu.de/"
        width="100%"
        height={800}
        title="Minecraft Map"
        className="min-h-[500px] w-full rounded-lg border-0"
        loading="lazy"
      />
    </div>
  );
}
