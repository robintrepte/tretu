import { db as defaultDb, type Db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"

/** Admin actions (admin API and `npm run admin`), each recorded as `admin.<action>`. */
export type AdminAction = "roles_changed" | "sessions_revoked" | "locked" | "unlocked" | "two_factor_reset" | "link_removed" | "email_verified" | "merge"

/** Event names shown under "Sicherheit" (translated in messages/*.json → audit.events). */
export type AuditEvent =
  | "login"
  | "login.failed"
  | "logout"
  | "register"
  | "email.verified"
  | "email.change_requested"
  | "password.changed"
  | "password.reset"
  | "password.reset_requested"
  | "password.rehashed"
  | "2fa.enabled"
  | "2fa.disabled"
  | "2fa.failed"
  | "2fa.backup_codes"
  | "2fa.challenge"
  | "2fa.backup_code_used"
  | "passkey.added"
  | "passkey.removed"
  | "link.added"
  | "link.removed"
  | "sessions.revoked"
  | "profile.updated"
  | "username.changed"
  | "locale.changed"
  | "data.exported"
  | "roles.changed"
  | "lock.expired"
  /** Done by an admin (lib/admin/audit.ts): `admin.<action>` on the account it was done to … */
  | `admin.${AdminAction}`
  /** … and `admin.performed` on the admin's own account. */
  | "admin.performed"

export interface AuditInput {
  userId?: string | null
  success?: boolean
  ipAddress?: string | null
  userAgent?: string | null
  meta?: Record<string, unknown>
}

/** Writes an audit entry. Never throws: auditing must not break a sign-in. */
export async function audit(event: AuditEvent, input: AuditInput = {}, db: Db = defaultDb): Promise<void> {
  try {
    await db.insert(auditLog).values({
      event,
      userId: input.userId ?? null,
      success: input.success ?? true,
      ipAddress: input.ipAddress?.slice(0, 64) ?? null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      meta: input.meta ?? null,
    })
  } catch (error) {
    console.error("[audit] could not write", event, error instanceof Error ? error.message : error)
  }
}

/** Client IP from a request behind nginx (X-Forwarded-For first hop, then X-Real-IP). */
export function requestIp(headers: Headers | null | undefined): string | null {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || headers?.get("x-real-ip") || null
}
