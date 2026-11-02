import { z } from "zod"
import { db } from "@/lib/db"
import { mergeAccounts } from "@/lib/admin/actions"
import { adminMutation } from "@/lib/admin/http"
import { getAdminUserItem } from "@/lib/admin/users"
import { apiError } from "@/lib/tretu/admin-api"

export const dynamic = "force-dynamic"

const sub = z.string().min(1).max(64)

/**
 * POST /api/v1/admin/merge `{ actorSub, reason, from, into, dryRun }` — joins account `from` into `into` (the same as
 * `npm run admin -- merge`): `dryRun: true` only answers the plan.
 */
export async function POST(request: Request) {
  const call = await adminMutation(request, { from: sub, into: sub, dryRun: z.boolean() })
  if (call instanceof Response) return call
  const { from, into, dryRun, reason } = call.input
  const result = await mergeAccounts(db, { actor: call.actor, fromId: from, intoId: into, reason, dryRun })
  if (!result.ok) return apiError(result.status, result.error, result.message)
  if (result.dryRun) return Response.json({ ok: true, dryRun: true, plan: result.plan })
  return Response.json({ ok: true, dryRun: false, merged: true, plan: result.plan, user: await getAdminUserItem(db, into) })
}
