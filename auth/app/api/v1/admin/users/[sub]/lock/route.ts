import { z } from "zod"
import { db } from "@/lib/db"
import { lockUser } from "@/lib/admin/actions"
import { actionResponse, adminMutation, notFound, targetSub } from "@/lib/admin/http"
import { apiError } from "@/lib/tretu/admin-api"

export const dynamic = "force-dynamic"

/**
 * POST /api/v1/admin/users/{sub}/lock `{ actorSub, reason, until?: ISO }` — no sign-in until unlocked (or `until`);
 * signs the account out everywhere. Admins cannot lock themselves or the last admin.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/users/[sub]/lock">) {
  const call = await adminMutation(request, { until: z.iso.datetime({ offset: true }).nullish() })
  if (call instanceof Response) return call
  const sub = targetSub((await params).sub)
  if (!sub) return notFound()
  const until = call.input.until ? new Date(call.input.until) : null
  if (until && until.getTime() <= Date.now()) return apiError(400, "invalid_request", "until must be in the future")
  const result = await lockUser(db, { actor: call.actor, targetId: sub, reason: call.input.reason, until })
  return actionResponse(result, sub, () => ({ lockedUntil: until?.toISOString() ?? null }))
}
