import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { json, parseBody, signedRoute } from "@/lib/platform/http";
import { createNotification, isSafeUrl } from "@/lib/platform/notifications";

const schema = z.object({
  sub: z.string().min(1).max(128),
  type: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  url: z.string().max(2000).refine(isSafeUrl, "url must be a path or an http(s) URL").optional(),
  icon: z.string().max(100).optional(),
});

/** POST /api/v1/notifications {sub,type,title,body?,url?,icon?} → { id } */
export const POST = signedRoute(async (_req, { app, rawBody }) => {
  const body = parseBody(rawBody, schema);
  const user = await requireUser(platformDb, body.sub);
  return json(await createNotification(platformDb, { ...body, sub: user.sub, app }));
});
