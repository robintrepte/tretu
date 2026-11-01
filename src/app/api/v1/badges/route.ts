import { BADGES, localizeBadge } from "@/lib/platform/badges";
import { json, signedRoute } from "@/lib/platform/http";

/** GET /api/v1/badges[?locale=en] → { badges:[{key,title,description,icon,xp,credits}] } */
export const GET = signedRoute(async (_req, { url }) => {
  const locale = url.searchParams.get("locale") === "en" ? "en" : "de";
  return json({ badges: BADGES.map((b) => localizeBadge(b, locale)) });
});
