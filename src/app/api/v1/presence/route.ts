import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { json, parseQuery, signedRoute } from "@/lib/platform/http";
import { getPresence } from "@/lib/platform/presence";

const schema = z.object({ subs: z.string().max(20_000) });

/** GET /api/v1/presence?subs=a,b,c → { presence: { [sub]: {app,status,activity,joinUrl,updatedAt} } } */
export const GET = signedRoute(async (_req, { url }) => {
  const { subs } = parseQuery(url, schema);
  const list = subs.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  return json({ presence: await getPresence(platformDb, list) });
});
