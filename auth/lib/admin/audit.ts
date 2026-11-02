import { audit, type AdminAction } from "@/lib/audit"
import type { Db } from "@/lib/db"

/** Who does an admin action: an admin through the admin API (signed by tretu.de), or the owner on the server CLI. */
export type AdminActor = { kind: "admin"; sub: string; username: string | null } | { kind: "cli" }

export const CLI_ACTOR: AdminActor = { kind: "cli" }

/**
 * Records an admin action twice: `admin.<action>` in the activity log of the account it was done to (shown there
 * as "… by the Tretu team"; the admin and the reason are kept for the admin view and the data export), and
 * `admin.performed` in the acting admin's own log (with the target).
 */
export async function recordAdminAction(
  db: Db,
  input: { action: AdminAction; actor: AdminActor; target: { id: string; username: string | null }; reason: string; details?: Record<string, unknown> },
): Promise<void> {
  const { action, actor, target, reason, details = {} } = input
  const byAdmin = actor.kind === "admin"
  await audit(
    `admin.${action}`,
    {
      userId: target.id,
      meta: { by: byAdmin ? "api" : "cli", ...(byAdmin && { actorSub: actor.sub, actorUsername: actor.username }), reason, ...details },
    },
    db,
  )
  if (byAdmin && actor.sub !== target.id) {
    await audit("admin.performed", { userId: actor.sub, meta: { action, targetSub: target.id, targetUsername: target.username, reason, ...details } }, db)
  }
}
