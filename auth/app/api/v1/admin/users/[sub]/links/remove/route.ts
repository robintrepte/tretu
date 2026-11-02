import { z } from "zod"
import { db } from "@/lib/db"
import { REMOVABLE_LINKS, removeLink } from "@/lib/admin/actions"
import { actionResponse, adminMutation, notFound, targetSub } from "@/lib/admin/http"

export const dynamic = "force-dynamic"

/**
 * POST /api/v1/admin/users/{sub}/links/remove `{ actorSub, reason, provider }` — a sign-in identity (discord, google,
 * apple, steam; never the last way to sign in) or a game link (minecraft, teamspeak).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/admin/users/[sub]/links/remove">) {
  const call = await adminMutation(request, { provider: z.enum(REMOVABLE_LINKS) })
  if (call instanceof Response) return call
  const sub = targetSub((await params).sub)
  if (!sub) return notFound()
  return actionResponse(await removeLink(db, { actor: call.actor, targetId: sub, provider: call.input.provider, reason: call.input.reason }), sub)
}
