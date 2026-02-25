import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Allow search engines and common AI/LLM crawlers for indexing.
 * GPTBot, Claude-Web, etc. may not all respect robots.txt; allowing keeps rules clear.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "Claude-Web", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
