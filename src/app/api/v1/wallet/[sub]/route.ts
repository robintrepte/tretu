import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { CURRENCY } from "@/lib/platform/economy";
import { json, signedRoute } from "@/lib/platform/http";
import { getBalance } from "@/lib/platform/wallet";

/** GET /api/v1/wallet/{sub} → { sub, balance, currency } (creates the wallet + welcome bonus). */
export const GET = signedRoute<{ sub: string }>(async (_req, { params }) => {
  const user = await requireUser(platformDb, params.sub);
  return json({ sub: user.sub, balance: await getBalance(platformDb, user.sub), currency: CURRENCY });
});
