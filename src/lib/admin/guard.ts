/**
 * Shared rules for every central-admin mutation: a required reason, a per-admin rate limit, and an audit row
 * (`platform_admin_audit`) for the outcome, success or failure.
 */
import { log } from "@/lib/observability/logger";
import type { AdminActor } from "@/lib/admin/access";
import { recordAdminAudit, type AdminAction } from "@/lib/admin/audit";
import { AuthAdminError } from "@/lib/admin/auth-admin";
import { platformDb } from "@/lib/platform/db";
import { intEnv } from "@/lib/platform/env";
import { PlatformError } from "@/lib/platform/errors";
import { RateLimiter } from "@/lib/platform/rate-limit";

export type AdminErrorCode =
  | "invalid_reason"
  | "invalid_input"
  | "rate_limited"
  | "self_action"
  | "user_not_found"
  | "unknown_badge"
  | "already_earned"
  | "not_earned"
  | "insufficient_funds"
  | "transaction_not_found"
  | "already_reversed"
  | "not_reversible";

/** A refusal of the hub itself (auth's refusals are {@link AuthAdminError}). */
export class AdminError extends Error {
  constructor(
    public readonly code: AdminErrorCode,
    public readonly detail: string | null = null
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AdminError";
  }
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** Trimmed reason (3–500 characters, as auth requires at least 3). */
export function validateReason(reason: unknown): string {
  const value = typeof reason === "string" ? reason.trim().replace(/\s+/g, " ") : "";
  if (value.length < REASON_MIN || value.length > REASON_MAX) throw new AdminError("invalid_reason");
  return value;
}

/** Mutations per admin: `TRETU_ADMIN_RATE_LIMIT_PER_MIN` (default 30) with burst `TRETU_ADMIN_RATE_LIMIT_BURST` (10). */
export const adminMutationLimiter = new RateLimiter(
  () => intEnv("TRETU_ADMIN_RATE_LIMIT_PER_MIN", 30, 1, 10_000),
  () => intEnv("TRETU_ADMIN_RATE_LIMIT_BURST", 10, 1, 10_000)
);

export function takeMutationToken(actor: AdminActor): void {
  if (adminMutationLimiter.take(`admin:${actor.sub}`) > 0) throw new AdminError("rate_limited");
}

export function errorCode(error: unknown): string {
  if (error instanceof AdminError || error instanceof AuthAdminError) return error.code;
  if (error instanceof PlatformError) return error.code;
  return "internal";
}

/** Key a `work` result may use to add facts to the audit row (e.g. a booked transaction id). */
export const AUDIT_EXTRA = "auditDetails";

function auditExtra(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object" || !(AUDIT_EXTRA in result)) return undefined;
  const extra = (result as Record<string, unknown>)[AUDIT_EXTRA];
  return extra && typeof extra === "object" && !Array.isArray(extra) ? (extra as Record<string, unknown>) : undefined;
}

/**
 * Runs one admin mutation: validates the reason, takes a rate-limit token, runs `work` and records the outcome
 * in the audit log. Validation and rate-limit refusals are not recorded (nothing was attempted).
 */
export async function auditedMutation<T>(
  actor: AdminActor,
  input: { action: AdminAction; targetSub: string | null; reason: unknown; details?: Record<string, unknown> },
  work: (reason: string) => Promise<T>
): Promise<T> {
  const reason = validateReason(input.reason);
  takeMutationToken(actor);
  const base = { ...(input.details ?? {}), reason };
  let result: T;
  try {
    result = await work(reason);
  } catch (error) {
    const code = errorCode(error);
    await recordAdminAudit(platformDb, {
      actorSub: actor.sub,
      action: input.action,
      targetSub: input.targetSub,
      details: { ...base, outcome: "failed", error: code },
    }).catch((auditError: unknown) =>
      log("error", "admin.audit_write_failed", { action: input.action, error: auditError instanceof Error ? auditError.message : "unknown" })
    );
    if (code === "internal") log("error", "admin.mutation_failed", { action: input.action, error: error instanceof Error ? error.message : "unknown" });
    throw error;
  }
  const extra = auditExtra(result);
  await recordAdminAudit(platformDb, {
    actorSub: actor.sub,
    action: input.action,
    targetSub: input.targetSub,
    details: { ...base, ...(extra ?? {}), outcome: "ok" },
  });
  log("info", "admin.action", { action: input.action });
  return result;
}
