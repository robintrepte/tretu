import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { PlatformError } from "@/lib/platform/errors";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";
import { getTsLinkState, startTsLink, teamspeakConfigured } from "@/lib/platform/teamspeak";
import { completeTsLink, removeTsLink } from "@/lib/platform/ts-auth-link";

export const GET = sessionRoute(async (_req, { user }) =>
  json({ enabled: teamspeakConfigured(), ...(await getTsLinkState(platformDb, user.sub)) })
);

const schema = z.object({ action: z.enum(["start", "verify"]) });

/**
 * POST /api/v1/me/teamspeak {action:"start"|"verify"} — link the TeamSpeak identity via a nickname code.
 * A verified link is also registered at auth.tretu.de (provider `teamspeak`), see ts-auth-link.ts.
 */
export const POST = sessionRoute(async (_req, { user, rawBody }) => {
  if (!teamspeakConfigured()) throw new PlatformError(409, "teamspeak_disabled");
  const body = parseBody(rawBody, schema);
  if (body.action === "start") return json(await startTsLink(platformDb, user.sub));
  const result = await completeTsLink(platformDb, user.sub);
  return json({ linked: true, ...result });
});

export const DELETE = sessionRoute(async (_req, { user }) => {
  await removeTsLink(platformDb, user.sub);
  return json({ ok: true });
});
