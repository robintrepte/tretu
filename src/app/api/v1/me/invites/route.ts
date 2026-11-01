import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { displayName, getDirectoryUser } from "@/lib/platform/directory";
import { createInvite } from "@/lib/platform/friends";
import { json, parseBody, sessionRoute } from "@/lib/platform/http";
import { translate } from "@/lib/platform/i18n-core";
import { INVITE_TARGETS } from "@/lib/platform/invite-targets";

const schema = z.object({
  to: z.string().min(1).max(128),
  target: z.enum(Object.keys(INVITE_TARGETS) as [keyof typeof INVITE_TARGETS, ...(keyof typeof INVITE_TARGETS)[]]),
});

/** POST /api/v1/me/invites {to, target} — invite a friend to one of the Tretu apps from tretu.de. */
export const POST = sessionRoute(async (_req, { user, rawBody }) => {
  const body = parseBody(rawBody, schema);
  const target = INVITE_TARGETS[body.target];
  const me = await getDirectoryUser(platformDb, user.sub);
  const friend = await getDirectoryUser(platformDb, body.to);
  const title = translate(friend?.locale, "friends.inviteDefaultTitle", {
    name: me ? displayName(me) : user.name,
    app: target.label,
  });
  return json(await createInvite(platformDb, { app: "tretu-web", from: user.sub, to: body.to, title, joinUrl: target.url }));
});
