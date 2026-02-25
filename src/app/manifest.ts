import type { MetadataRoute } from "next";
import { SITE_URL, SITE_NAME, SITE_NAME_FULL, DEFAULT_DESCRIPTION } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME_FULL,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#111111",
    theme_color: "#111111",
    orientation: "portrait-primary",
    lang: "de",
    scope: "/",
    id: SITE_URL,
    icons: [
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    categories: ["games", "social"],
  };
}
