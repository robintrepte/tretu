import { db } from "@/lib/db"
import { revokeSessions } from "@/lib/admin/actions"
import { actionResponse, adminMutation, notFound, targetSub } from "@/lib/admin/http"

export const dynamic = "force-dynamic"

/** POST /api/v1/admin/users/{sub}/sessions/revoke `{ actorSub, reason }` — every session, app token and pending code. */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/users/[sub]/sessions/revoke">) {
  const call = await adminMutation(request, {})
  if (call instanceof Response) return call
  const sub = targetSub((await params).sub)
  if (!sub) return notFound()
  const result = await revokeSessions(db, { actor: call.actor, targetId: sub, reason: call.input.reason })
  return actionResponse(result, sub, (r) => ({ revoked: { sessions: r.sessions, tokens: r.tokens } }))
}
