import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { isErased } from "@/lib/platform/directory";
import { notFound } from "@/lib/platform/errors";
import { noContent, parseBody, signedRoute } from "@/lib/platform/http";
import { isSafeUrl } from "@/lib/platform/notifications";
import { clearPresence, setPresence } from "@/lib/platform/presence";

const schema = z.object({
  status: z.enum(["online", "playing"]),
  activity: z.string().max(200).optional(),
  joinUrl: z.string().max(2000).refine(isSafeUrl, "joinUrl must be an http(s) URL").optional(),
});

/** PUT /api/v1/presence/{sub} → 204 (expires 120 s after the last PUT). */
export const PUT = signedRoute<{ sub: string }>(async (_req, { app, params, rawBody }) => {
  const body = parseBody(rawBody, schema);
  if (!params.sub || params.sub.length > 128 || (await isErased(platformDb, params.sub))) throw notFound("user_not_found");
  await setPresence(platformDb, params.sub, app, body);
  return noContent();
});

/** DELETE /api/v1/presence/{sub} → 204 (clears the calling app's presence). */
export const DELETE = signedRoute<{ sub: string }>(async (_req, { app, params }) => {
  await clearPresence(platformDb, params.sub, app);
  return noContent();
});
