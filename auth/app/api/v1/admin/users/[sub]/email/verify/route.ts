import { db } from "@/lib/db"
import { verifyEmail } from "@/lib/admin/actions"
import { actionResponse, adminMutation, notFound, targetSub } from "@/lib/admin/http"

export const dynamic = "force-dynamic"

/** POST /api/v1/admin/users/{sub}/email/verify `{ actorSub, reason }` — marks the address as confirmed (support cases). */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/users/[sub]/email/verify">) {
  const call = await adminMutation(request, {})
  if (call instanceof Response) return call
  const sub = targetSub((await params).sub)
  if (!sub) return notFound()
  return actionResponse(await verifyEmail(db, { actor: call.actor, targetId: sub, reason: call.input.reason }), sub)
}
