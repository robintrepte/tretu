import { db } from "@/lib/db"
import { unlockUser } from "@/lib/admin/actions"
import { actionResponse, adminMutation, notFound, targetSub } from "@/lib/admin/http"

export const dynamic = "force-dynamic"

/** POST /api/v1/admin/users/{sub}/unlock `{ actorSub, reason }`. */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/users/[sub]/unlock">) {
  const call = await adminMutation(request, {})
  if (call instanceof Response) return call
  const sub = targetSub((await params).sub)
  if (!sub) return notFound()
  return actionResponse(await unlockUser(db, { actor: call.actor, targetId: sub, reason: call.input.reason }), sub)
}
