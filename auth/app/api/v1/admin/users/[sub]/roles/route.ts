import { z } from "zod"
import { db } from "@/lib/db"
import { changeRoles, ROLE_PATTERN } from "@/lib/admin/actions"
import { actionResponse, adminMutation, notFound, targetSub } from "@/lib/admin/http"
import { apiError } from "@/lib/tretu/admin-api"

export const dynamic = "force-dynamic"

const roles = z.array(z.string().regex(ROLE_PATTERN, "roles are lowercase names (a-z, 0-9, _ and -)")).max(16).optional()

/** POST /api/v1/admin/users/{sub}/roles `{ actorSub, reason, add?, remove? }` — an admin cannot remove their own admin role. */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/users/[sub]/roles">) {
  const call = await adminMutation(request, { add: roles, remove: roles })
  if (call instanceof Response) return call
  const sub = targetSub((await params).sub)
  if (!sub) return notFound()
  const { add = [], remove = [], reason } = call.input
  if (!add.length && !remove.length) return apiError(400, "invalid_request", "add or remove at least one role")
  if (add.some((r) => remove.includes(r))) return apiError(400, "invalid_request", "a role cannot be added and removed at once")
  const result = await changeRoles(db, { actor: call.actor, targetId: sub, add, remove, reason })
  return actionResponse(result, sub)
}
