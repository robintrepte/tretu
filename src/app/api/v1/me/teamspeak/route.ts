import { z } from "zod";

import { enqueueBadgeResync, releaseStaleGrants } from "@/lib/platform/badge-sync";
import { platformDb } from "@/lib/platform/db";
import { PlatformError } from "@/lib/platform/errors";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";
import { getTsLinkState, startTsLink, teamspeakSyncEnabled, unlinkTs, verifyTsLink } from "@/lib/platform/teamspeak";

export const GET = sessionRoute(async (_req, { user }) =>
  json({ enabled: teamspeakSyncEnabled(), ...(await getTsLinkState(platformDb, user.sub)) })
);

const schema = z.object({ action: z.enum(["start", "verify"]) });

/** POST /api/v1/me/teamspeak {action:"start"|"verify"} — link the TeamSpeak identity via a nickname code. */
export const POST = sessionRoute(async (_req, { user, rawBody }) => {
  if (!teamspeakSyncEnabled()) throw new PlatformError(409, "teamspeak_disabled");
  const body = parseBody(rawBody, schema);
  if (body.action === "start") return json(await startTsLink(platformDb, user.sub));
  const result = await verifyTsLink(platformDb, user.sub);
  // Groups granted to a previously linked identity are taken back, the new one gets them.
  await releaseStaleGrants(platformDb, { sub: user.sub, target: "teamspeak" });
  await enqueueBadgeResync(platformDb, user.sub, "teamspeak");
  return json({ linked: true, ...result });
});

export const DELETE = sessionRoute(async (_req, { user }) => {
  const previous = await unlinkTs(platformDb, user.sub);
  await releaseStaleGrants(platformDb, { sub: user.sub, target: "teamspeak", previousIdentity: previous });
  return json({ ok: true });
});
