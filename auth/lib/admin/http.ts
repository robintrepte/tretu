import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { apiError, parseJson, verifyAdminRequest } from "@/lib/tretu/admin-api"
import { isAdmin, isLockActive } from "@/lib/users"
import type { ActionResult } from "./actions"
import type { AdminActor } from "./audit"
import { getAdminUserItem } from "./users"

/*
 * The admin API (/api/v1/admin/**): signed per contract §3 and only for tretu.de (app `tretu-web`), which runs the
 * central admin. Every change names the admin doing it (`actorSub`) and a `reason`; the actor must hold the
 * `admin` role right now, not be locked, and have two-factor sign-in on (as every admin sign-in requires).
 *
 * Errors: 400 invalid_request, 401 unauthorized (signature), 403 forbidden_app / actor_not_admin /
 * actor_two_factor_required / self_action, 404 not_found, 409 last_admin / last_sign_in_method / no_email / merge_refused.
 */

export const ADMIN_CALLER = "tretu-web"
const MAX_BODY_BYTES = 16 * 1024

/** Checks signature and caller. */
export async function adminCall(request: Request): Promise<{ body: string } | Response> {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_BODY_BYTES) return apiError(413, "payload_too_large")
  const verified = await verifyAdminRequest(request)
  if (verified instanceof Response) return verified
  if (verified.app !== ADMIN_CALLER) return apiError(403, "forbidden_app", "The admin API is only open to tretu.de")
  return { body: verified.body }
}

/** Whether `sub` may act as an admin right now; the actor, or the 403 response. */
export async function resolveActor(sub: string): Promise<AdminActor | Response> {
  const row = await db.query.user.findFirst({
    where: eq(s.user.id, sub),
    columns: { id: true, username: true, displayUsername: true, roles: true, locked: true, lockedUntil: true, twoFactorEnabled: true },
  })
  if (!row || !isAdmin(row.roles) || isLockActive(row)) return apiError(403, "actor_not_admin", "The acting account does not hold the admin role")
  if (!row.twoFactorEnabled) return apiError(403, "actor_two_factor_required", "The acting admin must have two-factor sign-in turned on")
  return { kind: "admin", sub: row.id, username: row.displayUsername ?? row.username }
}

const sub = z.string().min(1).max(64)
export const mutationBase = z.object({
  actorSub: sub,
  reason: z.string().trim().min(3, "reason must be at least 3 characters").max(500),
})

type MutationInput<T extends z.ZodRawShape> = z.infer<typeof mutationBase> & z.infer<z.ZodObject<T>>

/** A signed POST from tretu.de with a valid body (base fields plus `extra`) and a current admin as actor. */
export async function adminMutation<T extends z.ZodRawShape>(request: Request, extra: T): Promise<{ input: MutationInput<T>; actor: AdminActor } | Response> {
  const call = await adminCall(request)
  if (call instanceof Response) return call
  const parsed = mutationBase.extend(extra).safeParse(parseJson(call.body))
  if (!parsed.success) return apiError(400, "invalid_request", z.prettifyError(parsed.error))
  const input = parsed.data as MutationInput<T>
  const actor = await resolveActor(input.actorSub)
  if (actor instanceof Response) return actor
  return { input, actor }
}

/** A signed GET from tretu.de; an optional `actorSub` query parameter is checked like a mutation's actor. */
export async function adminRead(request: Request): Promise<{ url: URL } | Response> {
  const call = await adminCall(request)
  if (call instanceof Response) return call
  const url = new URL(request.url)
  const actorSub = url.searchParams.get("actorSub")
  if (actorSub !== null) {
    if (!sub.safeParse(actorSub).success) return apiError(400, "invalid_request", "actorSub is invalid")
    const actor = await resolveActor(actorSub)
    if (actor instanceof Response) return actor
  }
  return { url }
}

export const targetSub = (value: string) => (sub.safeParse(value).success ? value : null)
export const notFound = () => apiError(404, "not_found", "No Tretu-Konto with this sub")

/** The answer to a user action: the result plus the account as it is now (list item shape), or the error. */
export async function actionResponse<T extends object>(result: ActionResult<T>, userSub: string, extra: (r: { ok: true; changed: boolean } & T) => object = () => ({})) {
  if (!result.ok) return apiError(result.status, result.error, result.message)
  const user = await getAdminUserItem(db, userSub)
  return Response.json({ ok: true, changed: result.changed, ...extra(result), user })
}
