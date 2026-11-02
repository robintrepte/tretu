/**
 * Tretu-Credits in the central admin: overview, per-user history, manual adjustments (`adjust` bookings with the
 * idempotency key `admin:<uuid>`) and reversing a specific transaction (one reverse booking per transaction).
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { platformUsers, platformWalletAccounts, platformWalletTransactions } from "@/db/platform-schema";
import type { AdminActor } from "@/lib/admin/access";
import { assertSub } from "@/lib/admin/accounts";
import { AdminError, auditedMutation } from "@/lib/admin/guard";
import { platformDb, type Executor } from "@/lib/platform/db";
import { ensureUser } from "@/lib/platform/directory";
import { SELF_APP_ID } from "@/lib/platform/env";
import { berlinDay } from "@/lib/platform/time";
import { bookTransaction, InsufficientFundsError, listTransactions, peekBalance, type WalletHistoryItem } from "@/lib/platform/wallet";

/** Bookings made from the hub are booked as app `tretu-web` (idempotency keys are unique per app). */
export const ADMIN_LEDGER_APP = SELF_APP_ID;
export const MAX_ADJUST = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WalletDay = { day: string; issued: number; spent: number; bought: number };

export type WalletOverview = {
  totalBalance: number;
  wallets: number;
  days: WalletDay[];
  topHolders: { sub: string; name: string | null; username: string | null; balance: number }[];
};

/** The last `days` Europe/Berlin days ending today, oldest first (`YYYY-MM-DD`). */
export function lastDays(days: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(berlinDay(new Date(now.getTime() - i * 24 * 3600_000)));
  return [...new Set(out)];
}

/**
 * Credits per Berlin day: `issued` = everything credited to users except purchases (welcome, daily, rewards,
 * grants, refunds, positive adjustments, migrations), `spent` = everything debited (spends, negative
 * adjustments), `bought` = purchases.
 */
export async function creditsPerDay(db: Executor, days = 30, now: Date = new Date()): Promise<WalletDay[]> {
  const range = lastDays(days, now);
  // One extra day covers the Berlin offset; days outside `range` are dropped below.
  const since = new Date(now.getTime() - (days + 1) * 24 * 3600_000);
  const rows = (await db.execute(sql`
    select to_char(created_at at time zone 'Europe/Berlin', 'YYYY-MM-DD') as day,
      coalesce(sum(amount) filter (where amount > 0 and kind <> 'purchase'), 0)::bigint as issued,
      coalesce(sum(-amount) filter (where amount < 0), 0)::bigint as spent,
      coalesce(sum(amount) filter (where kind = 'purchase'), 0)::bigint as bought
    from platform_wallet_transactions
    where created_at >= ${since.toISOString()}::timestamptz and sub is not null
    group by 1`)) as unknown as { day: string; issued: string | number; spent: string | number; bought: string | number }[];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return range.map((day) => {
    const r = byDay.get(day);
    return { day, issued: Number(r?.issued ?? 0), spent: Number(r?.spent ?? 0), bought: Number(r?.bought ?? 0) };
  });
}

export async function walletOverview(db: Executor = platformDb, now: Date = new Date()): Promise<WalletOverview> {
  const [[totals], days, top] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${platformWalletAccounts.balance}), 0)::bigint`, n: sql<number>`count(*)::int` })
      .from(platformWalletAccounts)
      .where(eq(platformWalletAccounts.kind, "user")),
    creditsPerDay(db, 30, now),
    db
      .select({
        sub: platformWalletAccounts.sub,
        balance: platformWalletAccounts.balance,
        name: platformUsers.name,
        username: platformUsers.username,
      })
      .from(platformWalletAccounts)
      .leftJoin(platformUsers, eq(platformUsers.sub, platformWalletAccounts.sub))
      .where(eq(platformWalletAccounts.kind, "user"))
      .orderBy(desc(platformWalletAccounts.balance))
      .limit(10),
  ]);
  return {
    totalBalance: Number(totals?.total ?? 0),
    wallets: totals?.n ?? 0,
    days,
    topHolders: top.filter((t) => t.sub).map((t) => ({ sub: t.sub as string, name: t.name, username: t.username, balance: t.balance })),
  };
}

export async function walletOfUser(
  db: Executor,
  sub: string,
  options: { before?: string | null } = {}
): Promise<{ balance: number | null; items: WalletHistoryItem[]; reversed: Set<string> }> {
  assertSub(sub);
  const [balance, items] = await Promise.all([peekBalance(db, sub), listTransactions(db, sub, { limit: 50, before: options.before })]);
  // Which of these were already reversed from the admin (key `reverse:<id>`).
  const reversed = new Set<string>();
  if (items.length) {
    const rows = await db
      .select({ ref: platformWalletTransactions.ref })
      .from(platformWalletTransactions)
      .where(
        and(
          eq(platformWalletTransactions.app, ADMIN_LEDGER_APP),
          sql`${platformWalletTransactions.idempotencyKey} in (${sql.join(
            items.map((i) => sql`${`reverse:${i.id}`}`),
            sql`, `
          )})`
        )
      );
    for (const r of rows) if (r.ref) reversed.add(r.ref);
  }
  return { balance, items, reversed };
}

async function requireKnownUser(sub: string): Promise<void> {
  const user = await ensureUser(platformDb, sub, { createStub: false });
  if (!user) throw new AdminError("user_not_found");
}

/**
 * Manual adjustment (+/−). `requestId` (a UUID created when the form opens) makes the booking idempotent:
 * submitting the same form twice books once.
 */
export async function adjustBalance(
  actor: AdminActor,
  input: { sub: string; amount: unknown; reason: unknown; requestId: unknown },
  now: Date = new Date()
) {
  const sub = assertSub(input.sub);
  const amount = typeof input.amount === "string" ? Number(input.amount.trim()) : Number(input.amount);
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUST) throw new AdminError("invalid_input", "amount");
  const requestId = typeof input.requestId === "string" ? input.requestId.trim().toLowerCase() : "";
  if (!UUID.test(requestId)) throw new AdminError("invalid_input", "requestId");
  const idempotencyKey = `admin:${requestId}`;
  return auditedMutation(actor, { action: "wallet.adjust", targetSub: sub, reason: input.reason, details: { amount, idempotencyKey } }, async (reason) => {
    await requireKnownUser(sub);
    try {
      const result = await bookTransaction(platformDb, {
        sub,
        app: ADMIN_LEDGER_APP,
        idempotencyKey,
        kind: "adjust",
        amount,
        reason,
        now,
      });
      return { ...result, auditDetails: { transactionId: result.transactionId, balance: result.balance, duplicate: result.duplicate } };
    } catch (error) {
      if (error instanceof InsufficientFundsError) throw new AdminError("insufficient_funds", String(error.balance));
      throw error;
    }
  });
}

/**
 * Reverses one transaction with a counter-booking of the opposite amount: a spend comes back as `refund`,
 * anything else as `adjust`. Idempotent per transaction (key `reverse:<transactionId>`); credits a user has
 * already spent cannot be taken back (insufficient funds).
 */
export async function reverseTransaction(actor: AdminActor, input: { transactionId: unknown; reason: unknown }, now: Date = new Date()) {
  const id = typeof input.transactionId === "string" ? input.transactionId.trim().toLowerCase() : "";
  if (!UUID.test(id)) throw new AdminError("invalid_input", "transactionId");
  const [original] = await platformDb.select().from(platformWalletTransactions).where(eq(platformWalletTransactions.id, id)).limit(1);
  if (!original) throw new AdminError("transaction_not_found");
  const sub = original.sub;
  return auditedMutation(
    actor,
    { action: "wallet.reverse", targetSub: sub, reason: input.reason, details: { transactionId: id, amount: -original.amount, originalKind: original.kind } },
    async (reason) => {
      if (!sub) throw new AdminError("not_reversible");
      const kind = original.kind === "spend" ? "refund" : "adjust";
      try {
        const result = await bookTransaction(platformDb, {
          sub,
          app: ADMIN_LEDGER_APP,
          idempotencyKey: `reverse:${id}`,
          kind,
          amount: -original.amount,
          reason,
          ref: id,
          now,
        });
        if (result.duplicate) throw new AdminError("already_reversed");
        return { ...result, auditDetails: { reverseTransactionId: result.transactionId, balance: result.balance } };
      } catch (error) {
        if (error instanceof InsufficientFundsError) throw new AdminError("insufficient_funds", String(error.balance));
        throw error;
      }
    }
  );
}
