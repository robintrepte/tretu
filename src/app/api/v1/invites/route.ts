import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { createInvite } from "@/lib/platform/friends";
import { json, parseBody, signedRoute } from "@/lib/platform/http";

const schema = z.object({
  from: z.string().min(1).max(128),
  to: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  joinUrl: z.string().min(1).max(2000),
});

/** POST /api/v1/invites {from,to,title,joinUrl} → { notificationId } (403 unless friends). */
export const POST = signedRoute(async (_req, { app, rawBody }) => {
  const body = parseBody(rawBody, schema);
  return json(await createInvite(platformDb, { app, ...body }));
});
