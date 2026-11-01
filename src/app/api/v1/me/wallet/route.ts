import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { json, parseQuery, sessionRoute } from "@/lib/platform/http";
import { UUID_PATTERN } from "@/lib/platform/notifications";
import { dailyAvailable, getBalance, listTransactions } from "@/lib/platform/wallet";

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().regex(UUID_PATTERN).optional(),
});

/** GET /api/v1/me/wallet → { balance, dailyAvailable, items } */
export const GET = sessionRoute(async (_req, { user, url }) => {
  const query = parseQuery(url, schema);
  return json({
    balance: await getBalance(platformDb, user.sub),
    dailyAvailable: await dailyAvailable(platformDb, user.sub),
    items: await listTransactions(platformDb, user.sub, { limit: query.limit ?? 25, before: query.before }),
  });
});
