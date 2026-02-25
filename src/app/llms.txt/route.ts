import { SITE_URL, SITE_NAME_FULL, DEFAULT_DESCRIPTION } from "@/lib/seo";

/**
 * llms.txt – LLM-friendly site summary for AI crawlers and indexing.
 * See: https://llmstxt.org/
 */
export async function GET() {
  const content = `# ${SITE_NAME_FULL}

${DEFAULT_DESCRIPTION}

## Overview
- **Language:** German (de)
- **Type:** Gaming community website
- **URL:** ${SITE_URL}

## Main sections
- Home: ${SITE_URL}/
- Teamspeak: ${SITE_URL}/teamspeak
- Discord: ${SITE_URL}/discord
- Livestream (Twitch): ${SITE_URL}/live
- YouTube Videos: ${SITE_URL}/videos
- Teamspeak Ranking: ${SITE_URL}/ranking
- Minecraft Map: ${SITE_URL}/map
- Impressum (Legal): ${SITE_URL}/impressum
- Datenschutz (Privacy): ${SITE_URL}/datenschutz

## Sitemap
${SITE_URL}/sitemap.xml

## Contact
Business: business(at)tretu.de (replace (at) with @)
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
