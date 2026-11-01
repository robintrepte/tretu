/**
 * Tretu-Credits wallet: a double-entry ledger.
 *
 * Every transaction writes exactly two entries that sum to zero: the user's account and a system
 * counter-account (system:welcome, system:daily, …). The sum of all account balances is therefore
 * always 0. The user account row is locked (SELECT … FOR UPDATE) before the idempotency check and
 * the balance check, so concurrent spends are serialised and can never overdraw; a CHECK constraint
 * (`balance >= 0` for user accounts) is the last line of defence.
 */
import { and, desc, eq, lt } from "drizzle-orm";

import {
  platformWalletAccounts,
  platformWalletDaily,
  platformWalletEntries,
  platformWalletTransactions,
} from "@/db/platform-schema";
import { inTransaction, type Executor } from "@/lib/platform/db";
import { getEconomy, SYSTEM_ACCOUNTS } from "@/lib/platform/economy";
import { conflict, PlatformError } from "@/lib/platform/errors";
import { emitPlatformEvent } from "@/lib/platform/outbox";
import { berlinDay } from "@/lib/platform/time";

/** Kinds apps may book via POST /wallet/{sub}/transactions. */
export const API_WALLET_KINDS = ["spend", "purchase", "reward", "refund", "grant", "migration", "adjust"] as const;
/** Kinds the platform books itself. */
export type WalletKind = (typeof API_WALLET_KINDS)[number] | "welcome" | "daily";

const COUNTER_ACCOUNT: Record<WalletKind, string> = {
  spend: SYSTEM_ACCOUNTS.spend,
  refund: SYSTEM_ACCOUNTS.spend,
  purchase: SYSTEM_ACCOUNTS.purchases,
  reward: SYSTEM_ACCOUNTS.rewards,
  grant: SYSTEM_ACCOUNTS.grants,
  migration: SYSTEM_ACCOUNTS.migration,
  adjust: SYSTEM_ACCOUNTS.adjust,
  welcome: SYSTEM_ACCOUNTS.welcome,
  daily: SYSTEM_ACCOUNTS.daily,
};

/** Internal bookings use this app id for their idempotency keys. */
export const PLATFORM_LEDGER_APP = "platform";

export class InsufficientFundsError extends PlatformError {
  constructor(public readonly balance: number) {
    super(402, "insufficient_funds", "Not enough Tretu-Credits.", { balance });
  }
}

export const userOwner = (sub: string) => `user:${sub}`;

type Account = { id: string; balance: number };

async function lockAccount(db: Executor, owner: string): Promise<Account | null> {
  const rows = await db
    .select({ id: platformWalletAccounts.id, balance: platformWalletAccounts.balance })
    .from(platformWalletAccounts)
    .where(eq(platformWalletAccounts.owner, owner))
    .for("update");
  return rows[0] ?? null;
}

async function lockSystemAccount(db: Executor, owner: string): Promise<Account> {
  await db.insert(platformWalletAccounts).values({ owner, kind: "system" }).onConflictDoNothing();
  const account = await lockAccount(db, owner);
  if (!account) throw new Error(`system account ${owner} missing`);
  return account;
}

export type BookingInput = {
  sub: string;
  app: string;
  idempotencyKey: string;
  kind: WalletKind;
  amount: number;
  reason?: string | null;
  ref?: string | null;
  now?: Date;
};

export type BookingResult = { transactionId: string; balance: number; duplicate: boolean };

/** Books one transaction (with its two ledger entries). Must run inside a transaction. */
async function post(tx: Executor, input: BookingInput, user: Account): Promise<BookingResult> {
  const existing = await tx
    .select()
    .from(platformWalletTransactions)
    .where(
      and(
        eq(platformWalletTransactions.app, input.app),
        eq(platformWalletTransactions.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (existing[0]) {
    if (existing[0].sub !== input.sub) throw conflict("idempotency_conflict", "Idempotency key used for another user.");
    const entry = await tx
      .select({ balanceAfter: platformWalletEntries.balanceAfter })
      .from(platformWalletEntries)
      .where(and(eq(platformWalletEntries.transactionId, existing[0].id), eq(platformWalletEntries.accountId, user.id)))
      .limit(1);
    return { transactionId: existing[0].id, balance: entry[0]?.balanceAfter ?? user.balance, duplicate: true };
  }

  const newBalance = user.balance + input.amount;
  if (newBalance < 0) throw new InsufficientFundsError(user.balance);
  const counter = await lockSystemAccount(tx, COUNTER_ACCOUNT[input.kind]);
  const now = input.now ?? new Date();

  const [row] = await tx
    .insert(platformWalletTransactions)
    .values({
      app: input.app,
      idempotencyKey: input.idempotencyKey,
      sub: input.sub,
      kind: input.kind,
      amount: input.amount,
      reason: input.reason ?? null,
      ref: input.ref ?? null,
      createdAt: now,
    })
    .returning({ id: platformWalletTransactions.id });
  const counterBalance = counter.balance - input.amount;
  await tx.insert(platformWalletEntries).values([
    { transactionId: row.id, accountId: user.id, amount: input.amount, balanceAfter: newBalance, createdAt: now },
    { transactionId: row.id, accountId: counter.id, amount: -input.amount, balanceAfter: counterBalance, createdAt: now },
  ]);
  await tx
    .update(platformWalletAccounts)
    .set({ balance: newBalance, updatedAt: now })
    .where(eq(platformWalletAccounts.id, user.id));
  await tx
    .update(platformWalletAccounts)
    .set({ balance: counterBalance, updatedAt: now })
    .where(eq(platformWalletAccounts.id, counter.id));
  user.balance = newBalance;

  await emitPlatformEvent(tx, {
    type: "wallet.changed",
    sub: input.sub,
    data: { balance: newBalance, delta: input.amount, kind: input.kind },
    now,
  });
  return { transactionId: row.id, balance: newBalance, duplicate: false };
}

/**
 * Creates the user's wallet on first access and books the one-time welcome bonus. The creation day
 * counts as already topped up (like Saga's `creditsRefilledAt = now` on registration).
 * Returns the locked account.
 */
async function openWallet(tx: Executor, sub: string, now: Date): Promise<Account> {
  const created = await tx
    .insert(platformWalletAccounts)
    .values({ owner: userOwner(sub), sub, kind: "user", createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning({ id: platformWalletAccounts.id });
  const account = await lockAccount(tx, userOwner(sub));
  if (!account) throw new Error("wallet account missing");
  if (created.length) {
    await tx.insert(platformWalletDaily).values({ sub, day: berlinDay(now), granted: 0, createdAt: now }).onConflictDoNothing();
    const bonus = getEconomy().welcomeBonus;
    if (bonus > 0) {
      await post(
        tx,
        {
          sub,
          app: PLATFORM_LEDGER_APP,
          idempotencyKey: `welcome:${sub}`,
          kind: "welcome",
          amount: bonus,
          reason: "Willkommensbonus",
          now,
        },
        account
      );
    }
  }
  return account;
}

/** Books a transaction for `sub` (creating the wallet if needed). Idempotent per (app, idempotencyKey). */
export async function bookTransaction(db: Executor, input: BookingInput): Promise<BookingResult> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
    throw new PlatformError(400, "invalid_amount", "amount must be a non-zero integer.");
  }
  return inTransaction(db, async (tx) => {
    const account = await openWallet(tx, input.sub, input.now ?? new Date());
    return post(tx, input, account);
  });
}

/** Balance for `sub`; creates the wallet (and books the welcome bonus) on first access. */
export async function getBalance(db: Executor, sub: string, now: Date = new Date()): Promise<number> {
  return inTransaction(db, async (tx) => (await openWallet(tx, sub, now)).balance);
}

/** Read-only balance (0 when there is no wallet yet); never creates anything. */
export async function peekBalance(db: Executor, sub: string): Promise<number | null> {
  const rows = await db
    .select({ balance: platformWalletAccounts.balance })
    .from(platformWalletAccounts)
    .where(eq(platformWalletAccounts.owner, userOwner(sub)))
    .limit(1);
  return rows[0]?.balance ?? null;
}

/**
 * Daily top-up: at most once per Europe/Berlin day across all apps. Tops the balance up to the
 * configured target (Saga semantics); higher balances stay as they are (granted 0, day consumed).
 */
export async function claimDaily(
  db: Executor,
  sub: string,
  now: Date = new Date()
): Promise<{ granted: number; balance: number }> {
  return inTransaction(db, async (tx) => {
    const account = await openWallet(tx, sub, now);
    const day = berlinDay(now);
    const claimed = await tx
      .insert(platformWalletDaily)
      .values({ sub, day, granted: 0, createdAt: now })
      .onConflictDoNothing()
      .returning({ day: platformWalletDaily.day });
    if (!claimed.length) return { granted: 0, balance: account.balance };
    const target = getEconomy().dailyTopUpTarget;
    const granted = target > 0 ? Math.max(0, target - account.balance) : 0;
    if (granted > 0) {
      await post(
        tx,
        {
          sub,
          app: PLATFORM_LEDGER_APP,
          idempotencyKey: `daily:${sub}:${day}`,
          kind: "daily",
          amount: granted,
          reason: "Tägliche Auffüllung",
          now,
        },
        account
      );
      await tx
        .update(platformWalletDaily)
        .set({ granted })
        .where(and(eq(platformWalletDaily.sub, sub), eq(platformWalletDaily.day, day)));
    }
    return { granted, balance: account.balance };
  });
}

/** Whether today's (Europe/Berlin) top-up is still available. */
export async function dailyAvailable(db: Executor, sub: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .select({ day: platformWalletDaily.day })
    .from(platformWalletDaily)
    .where(and(eq(platformWalletDaily.sub, sub), eq(platformWalletDaily.day, berlinDay(now))))
    .limit(1);
  return rows.length === 0;
}

export type WalletHistoryItem = {
  id: string;
  amount: number;
  kind: string;
  reason: string | null;
  app: string;
  ref: string | null;
  balanceAfter: number;
  createdAt: string;
};

export async function listTransactions(
  db: Executor,
  sub: string,
  options: { limit?: number; before?: string | null } = {}
): Promise<WalletHistoryItem[]> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const accountRows = await db
    .select({ id: platformWalletAccounts.id })
    .from(platformWalletAccounts)
    .where(eq(platformWalletAccounts.owner, userOwner(sub)))
    .limit(1);
  const accountId = accountRows[0]?.id;
  if (!accountId) return [];

  let beforeEntryId: number | null = null;
  if (options.before) {
    const cursor = await db
      .select({ id: platformWalletEntries.id })
      .from(platformWalletEntries)
      .where(and(eq(platformWalletEntries.transactionId, options.before), eq(platformWalletEntries.accountId, accountId)))
      .limit(1);
    if (!cursor[0]) return [];
    beforeEntryId = cursor[0].id;
  }

  const rows = await db
    .select({
      entryId: platformWalletEntries.id,
      id: platformWalletTransactions.id,
      amount: platformWalletEntries.amount,
      kind: platformWalletTransactions.kind,
      reason: platformWalletTransactions.reason,
      app: platformWalletTransactions.app,
      ref: platformWalletTransactions.ref,
      balanceAfter: platformWalletEntries.balanceAfter,
      createdAt: platformWalletEntries.createdAt,
    })
    .from(platformWalletEntries)
    .innerJoin(platformWalletTransactions, eq(platformWalletTransactions.id, platformWalletEntries.transactionId))
    .where(
      beforeEntryId === null
        ? eq(platformWalletEntries.accountId, accountId)
        : and(eq(platformWalletEntries.accountId, accountId), lt(platformWalletEntries.id, beforeEntryId))
    )
    .orderBy(desc(platformWalletEntries.id))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    kind: r.kind,
    reason: r.reason,
    app: r.app,
    ref: r.ref,
    balanceAfter: r.balanceAfter,
    createdAt: r.createdAt.toISOString(),
  }));
}
