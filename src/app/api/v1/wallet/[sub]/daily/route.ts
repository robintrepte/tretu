import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { json, signedRoute } from "@/lib/platform/http";
import { claimDaily } from "@/lib/platform/wallet";

/** POST /api/v1/wallet/{sub}/daily → { granted, balance } (once per Europe/Berlin day across all apps). */
export const POST = signedRoute<{ sub: string }>(async (_req, { params }) => {
  const user = await requireUser(platformDb, params.sub);
  return json(await claimDaily(platformDb, user.sub));
});
