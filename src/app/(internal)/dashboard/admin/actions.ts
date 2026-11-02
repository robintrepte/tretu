"use server";

/**
 * Server actions of the central admin. Next.js only runs them for same-origin POSTs (Origin/Host check) with an
 * encrypted action id, so they are CSRF-safe; every action re-checks the Tretu admin role, and the service
 * layer (src/lib/admin) validates input, rate-limits per admin and writes the audit log.
 */
import { getTranslations } from "next-intl/server";

import { getAccountAdmin, type AdminActor } from "@/lib/admin/access";
import {
  type AccountChange,
  changeRoles,
  lockAccount,
  mergeAccounts,
  previewMerge,
  removeLink,
  resetTwoFactor,
  revokeSessions,
  unlockAccount,
  verifyEmail,
} from "@/lib/admin/accounts";
import { ACTOR_ERRORS, AuthAdminError } from "@/lib/admin/auth-admin";
import { grantBadge, resyncBadges, revokeBadge } from "@/lib/admin/badges-admin";
import { AdminError } from "@/lib/admin/guard";
import { summarizeMerge, type MergeSummary } from "@/lib/admin/merge-summary";
import { adjustBalance, reverseTransaction } from "@/lib/admin/wallet-admin";
import { log } from "@/lib/observability/logger";
import { PlatformDbUnavailableError } from "@/lib/platform/db";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string; detail?: string };
export type PreviewResult = { ok: true; summary: MergeSummary } | { ok: false; error: string; detail?: string };

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

async function describe(error: unknown): Promise<{ ok: false; error: string; detail?: string }> {
  const t = await getTranslations("admin.errors");
  if (error instanceof AdminError) return { ok: false, error: t(error.code) };
  if (error instanceof AuthAdminError) {
    // auth's own message only where it adds something (generic codes); known refusals are fully translated.
    const generic = ["forbidden", "conflict", "invalid", "not_found"].includes(error.code) && !ACTOR_ERRORS.has(error.code);
    const detail = error.detail && generic ? t("detail", { detail: error.detail }) : undefined;
    return { ok: false, error: t(`auth.${error.code}`), ...(detail ? { detail } : {}) };
  }
  if (error instanceof PlatformDbUnavailableError) return { ok: false, error: t("platform_unavailable") };
  log("error", "admin.action_failed", { error: error instanceof Error ? error.message : "unknown" });
  return { ok: false, error: t("internal") };
}

async function run(work: (actor: AdminActor) => Promise<string>): Promise<ActionResult> {
  const actor = await getAccountAdmin();
  if (!actor) {
    const t = await getTranslations("admin.errors");
    return { ok: false, error: t("forbidden") };
  }
  try {
    return { ok: true, message: await work(actor) };
  } catch (error) {
    return describe(error);
  }
}

async function msg(key: string, values?: Record<string, number | string>): Promise<string> {
  const t = await getTranslations("admin");
  return t(key, values);
}

/** The success message, or "nothing to change" when auth found the account already in that state. */
async function changeMsg(change: AccountChange, key: string): Promise<string> {
  return change.changed ? msg(key) : msg("account.actions.unchanged");
}

/* --------------------------------- accounts -------------------------------- */

export async function addRoleAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    return changeMsg(await changeRoles(actor, field(form, "sub"), { add: [field(form, "role")], reason: field(form, "reason") }), "account.actions.rolesChanged");
  });
}

export async function removeRoleAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    return changeMsg(await changeRoles(actor, field(form, "sub"), { remove: [field(form, "role")], reason: field(form, "reason") }), "account.actions.rolesChanged");
  });
}

export async function revokeSessionsAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    return changeMsg(await revokeSessions(actor, field(form, "sub"), { reason: field(form, "reason") }), "account.actions.sessionsRevoked");
  });
}

export async function lockAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    // `until` comes from <input type="datetime-local"> (browser time) converted to ISO on the client.
    const change = await lockAccount(actor, field(form, "sub"), { reason: field(form, "reason"), until: field(form, "untilIso") || undefined });
    return changeMsg(change, "account.actions.locked");
  });
}

export async function unlockAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    return changeMsg(await unlockAccount(actor, field(form, "sub"), { reason: field(form, "reason") }), "account.actions.unlocked");
  });
}

export async function resetTwoFactorAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    return changeMsg(await resetTwoFactor(actor, field(form, "sub"), { reason: field(form, "reason") }), "account.actions.twoFactorReset");
  });
}

export async function removeLinkAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const change = await removeLink(actor, field(form, "sub"), { reason: field(form, "reason"), provider: field(form, "provider") });
    return changeMsg(change, "account.actions.linkRemoved");
  });
}

export async function verifyEmailAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    return changeMsg(await verifyEmail(actor, field(form, "sub"), { reason: field(form, "reason") }), "account.actions.emailVerified");
  });
}

export async function previewMergeAction(input: { from: string; into: string }): Promise<PreviewResult> {
  const actor = await getAccountAdmin();
  if (!actor) {
    const t = await getTranslations("admin.errors");
    return { ok: false, error: t("forbidden") };
  }
  try {
    const preview = await previewMerge(actor, { from: input.from, into: input.into });
    return { ok: true, summary: summarizeMerge(preview.plan) };
  } catch (error) {
    return describe(error);
  }
}

export async function mergeAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await mergeAccounts(actor, { from: field(form, "from"), into: field(form, "into"), reason: field(form, "reason") });
    return msg("merge.done");
  });
}

/* ---------------------------------- wallet --------------------------------- */

export async function adjustBalanceAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await adjustBalance(actor, {
      sub: field(form, "sub"),
      amount: field(form, "amount"),
      reason: field(form, "reason"),
      requestId: field(form, "requestId"),
    });
    return msg("wallet.adjusted");
  });
}

export async function reverseTransactionAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await reverseTransaction(actor, { transactionId: field(form, "transactionId"), reason: field(form, "reason") });
    return msg("wallet.reversed");
  });
}

/* ---------------------------------- badges --------------------------------- */

export async function grantBadgeAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await grantBadge(actor, { sub: field(form, "sub").trim(), badge: field(form, "badge"), reason: field(form, "reason") });
    return msg("badges.granted");
  });
}

export async function revokeBadgeAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await revokeBadge(actor, { sub: field(form, "sub"), badge: field(form, "badge"), reason: field(form, "reason") });
    return msg("badges.revoked");
  });
}

export async function resyncBadgesAction(form: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const { queued } = await resyncBadges(actor, { sub: field(form, "sub"), reason: field(form, "reason") });
    return msg("badges.resynced", { count: queued });
  });
}
