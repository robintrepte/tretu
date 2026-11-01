import { platformDb } from "@/lib/platform/db";
import { json, sessionRoute } from "@/lib/platform/http";
import { claimDaily } from "@/lib/platform/wallet";

export const POST = sessionRoute(async (_req, { user }) => json(await claimDaily(platformDb, user.sub)));
