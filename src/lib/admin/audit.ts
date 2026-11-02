/**
 * Hub admin audit log (`platform_admin_audit`): one row per admin action done through tretu.de, including the
 * ones forwarded to auth.tretu.de (auth keeps its own `admin.*` entries as well). Failed attempts are recorded
 * too (`details.outcome = "failed"`), so refused actions stay visible.
 */
import { and, desc, eq, gte, inArray, lt, lte, type SQL } from "drizzle-orm";

import { platformAdminAudit, platformUsers } from "@/db/platform-schema";
import type { Executor } from "@/lib/platform/db";

export const ADMIN_ACTIONS = [
  "account.roles",
  "account.sessions.revoke",
  "account.lock",
  "account.unlock",
  "account.two_factor.reset",
  "account.link.remove",
  "account.email.verify",
  "account.merge",
  "wallet.adjust",
  "wallet.reverse",
  "badge.grant",
  "badge.revoke",
  "badge.resync",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type AuditDetails = Record<string, unknown> & { reason: string; outcome: "ok" | "failed"; error?: string };

export async function recordAdminAudit(
  db: Executor,
  entry: { actorSub: string; action: AdminAction; targetSub: string | null; details: AuditDetails; now?: Date }
): Promise<number> {
  const [row] = await db
    .insert(platformAdminAudit)
    .values({
      actorSub: entry.actorSub,
      action: entry.action,
      targetSub: entry.targetSub,
      details: entry.details,
      createdAt: entry.now ?? new Date(),
    })
    .returning({ id: platformAdminAudit.id });
  return row.id;
}

export type AuditFilters = {
  actor?: string | null;
  target?: string | null;
  action?: string | null;
  /** Inclusive `YYYY-MM-DD` (Europe/Berlin is close enough for a filter; boundaries are UTC days). */
  from?: string | null;
  to?: string | null;
  /** Rows with an id below this (pagination). */
  before?: number | null;
  limit?: number;
};

export type AuditRow = {
  id: number;
  actorSub: string;
  actorName: string | null;
  action: string;
  targetSub: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

function dayStart(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listAdminAudit(db: Executor, filters: AuditFilters = {}): Promise<{ items: AuditRow[]; nextBefore: number | null }> {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const where: (SQL | undefined)[] = [];
  if (filters.actor?.trim()) where.push(eq(platformAdminAudit.actorSub, filters.actor.trim()));
  if (filters.target?.trim()) where.push(eq(platformAdminAudit.targetSub, filters.target.trim()));
  if (filters.action?.trim()) where.push(eq(platformAdminAudit.action, filters.action.trim()));
  const from = dayStart(filters.from);
  if (from) where.push(gte(platformAdminAudit.createdAt, from));
  const to = dayStart(filters.to);
  if (to) where.push(lte(platformAdminAudit.createdAt, new Date(to.getTime() + 24 * 3600_000 - 1)));
  if (filters.before) where.push(lt(platformAdminAudit.id, filters.before));

  const rows = await db
    .select()
    .from(platformAdminAudit)
    .where(and(...where))
    .orderBy(desc(platformAdminAudit.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const subs = [...new Set(page.flatMap((r) => [r.actorSub, r.targetSub]).filter((s): s is string => Boolean(s)))];
  const names = new Map<string, string | null>();
  if (subs.length) {
    const people = await db
      .select({ sub: platformUsers.sub, name: platformUsers.name, username: platformUsers.username })
      .from(platformUsers)
      .where(inArray(platformUsers.sub, subs));
    for (const p of people) names.set(p.sub, p.name || p.username || null);
  }
  return {
    items: page.map((r) => ({
      id: r.id,
      actorSub: r.actorSub,
      actorName: names.get(r.actorSub) ?? null,
      action: r.action,
      targetSub: r.targetSub,
      targetName: r.targetSub ? (names.get(r.targetSub) ?? null) : null,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
    })),
    nextBefore: rows.length > limit ? page[page.length - 1].id : null,
  };
}
