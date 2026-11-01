import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { json, signedRoute } from "@/lib/platform/http";
import { getUserProfile } from "@/lib/platform/profile";

/** GET /api/v1/users/{sub}[?locale=en] → profile with level, badges and stats. */
export const GET = signedRoute<{ sub: string }>(async (_req, { params, url }) => {
  const user = await requireUser(platformDb, params.sub, { createStub: false });
  const locale = url.searchParams.get("locale") === "en" ? "en" : "de";
  return json(await getUserProfile(platformDb, user, locale));
});
