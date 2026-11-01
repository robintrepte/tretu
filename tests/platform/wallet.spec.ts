import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { eq, sql } from "drizzle-orm";

import { closeDatabase, ctx, resetDatabase, seedUser, signedRequest, uuid } from "./helpers";
import { POST as postDaily } from "../../src/app/api/v1/wallet/[sub]/daily/route";
import { GET as getWallet } from "../../src/app/api/v1/wallet/[sub]/route";
import { GET as listTx, POST as postTx } from "../../src/app/api/v1/wallet/[sub]/transactions/route";
import { platformOutbox, platformWalletAccounts, platformWalletEntries } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { bookTransaction, claimDaily, getBalance, InsufficientFundsError, listTransactions } from "../../src/lib/platform/wallet";

beforeEach(resetDatabase);
after(closeDatabase);

async function assertLedgerBalanced() {
  const [total] = await platformDb.select({ sum: sql<string>`coalesce(sum(${platformWalletAccounts.balance}), 0)` }).from(platformWalletAccounts);
  assert.equal(Number(total.sum), 0, "sum of all account balances must be 0");
  const unbalanced = await platformDb.execute(
    sql`select transaction_id from platform_wallet_entries group by transaction_id having sum(amount) <> 0 or count(*) <> 2`
  );
  assert.equal(unbalanced.length, 0, "every transaction has two entries summing to 0");
  const mismatched = await platformDb.execute(
    sql`select a.id from platform_wallet_accounts a left join platform_wallet_entries e on e.account_id = a.id
        group by a.id, a.balance having a.balance <> coalesce(sum(e.amount), 0)`
  );
  assert.equal(mismatched.length, 0, "account balances equal the sum of their entries");
}

async function spend(sub: string, body: Record<string, unknown>, app = "saga") {
  const res = await postTx(await signedRequest(app, "POST", `/api/v1/wallet/${sub}/transactions`, body), ctx({ sub }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("GET /wallet creates the wallet with the welcome bonus once", async () => {
  const sub = uuid();
  await seedUser(sub, "anna");
  const res = await getWallet(await signedRequest("saga", "GET", `/api/v1/wallet/${sub}`), ctx({ sub }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sub, balance: 500, currency: "TC" });
  await Promise.all(Array.from({ length: 10 }, () => getBalance(platformDb, sub)));
  assert.equal(await getBalance(platformDb, sub), 500);
  const items = await listTransactions(platformDb, sub);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "welcome");
  assert.equal(items[0].balanceAfter, 500);
  await assertLedgerBalanced();
});

test("transactions: idempotency, 402 insufficient funds, sign rules, history paging", async () => {
  const sub = uuid();
  await seedUser(sub, "ben");
  let res = await spend(sub, { idempotencyKey: "turn-1", amount: -30, kind: "spend", reason: "Bild (HQ)", ref: "img-1" });
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 470);
  assert.equal(res.body.duplicate, false);
  const txId = res.body.transactionId;

  res = await spend(sub, { idempotencyKey: "turn-1", amount: -30, kind: "spend", reason: "Bild (HQ)" });
  assert.deepEqual(res.body, { transactionId: txId, balance: 470, duplicate: true });

  // Same key from another app is a different transaction.
  res = await spend(sub, { idempotencyKey: "turn-1", amount: -10, kind: "spend", reason: "x" }, "play");
  assert.equal(res.body.duplicate, false);
  assert.equal(res.body.balance, 460);

  res = await spend(sub, { idempotencyKey: "big", amount: -461, kind: "spend", reason: "too much" });
  assert.equal(res.status, 402);
  assert.deepEqual(res.body, { error: "insufficient_funds", message: "Not enough Tretu-Credits.", balance: 460 });

  res = await spend(sub, { idempotencyKey: "neg-reward", amount: -5, kind: "reward", reason: "x" });
  assert.equal(res.body.error, "invalid_amount");
  res = await spend(sub, { idempotencyKey: "pos-spend", amount: 5, kind: "spend", reason: "x" });
  assert.equal(res.body.error, "invalid_amount");
  res = await spend(sub, { idempotencyKey: "zero", amount: 0, kind: "grant", reason: "x" });
  assert.equal(res.status, 400);
  res = await spend(sub, { idempotencyKey: "p1", amount: 1000, kind: "purchase", reason: "Paket M", ref: "stripe:cs_1" });
  assert.equal(res.body.balance, 1460);
  res = await spend(sub, { idempotencyKey: "r1", amount: 30, kind: "refund", reason: "Bild fehlgeschlagen", ref: "img-1" });
  assert.equal(res.body.balance, 1490);

  // Key reused for another user → 409.
  const other = uuid();
  await seedUser(other, "other");
  res = await spend(other, { idempotencyKey: "p1", amount: 5, kind: "grant", reason: "x" }, "saga");
  assert.equal(res.status, 409);

  const page1 = await listTx(await signedRequest("saga", "GET", `/api/v1/wallet/${sub}/transactions?limit=2`), ctx({ sub }));
  const items1 = ((await page1.json()) as { items: { id: string; kind: string; balanceAfter: number }[] }).items;
  assert.equal(items1.length, 2);
  assert.deepEqual(items1.map((i) => i.kind), ["refund", "purchase"]);
  const page2 = await listTx(
    await signedRequest("saga", "GET", `/api/v1/wallet/${sub}/transactions?limit=10&before=${items1[1].id}`),
    ctx({ sub })
  );
  const items2 = ((await page2.json()) as { items: { kind: string; balanceAfter: number }[] }).items;
  assert.deepEqual(items2.map((i) => i.kind), ["spend", "spend", "welcome"]);
  assert.deepEqual(items2.map((i) => i.balanceAfter), [460, 470, 500]);

  const changes = await platformDb.select().from(platformOutbox).where(eq(platformOutbox.type, "wallet.changed"));
  assert.ok(changes.some((c) => (c.payload.data as { delta: number }).delta === -30));
  await assertLedgerBalanced();
});

test("daily top-up: once per Europe/Berlin day, top up to target, not on the creation day", async () => {
  const sub = uuid();
  await seedUser(sub, "clara");
  const created = new Date("2026-03-28T12:00:00Z"); // Sat, before the DST switch
  assert.equal(await getBalance(platformDb, sub, created), 500);
  assert.deepEqual(await claimDaily(platformDb, sub, created), { granted: 0, balance: 500 });

  await bookTransaction(platformDb, { sub, app: "saga", idempotencyKey: "s1", kind: "spend", amount: -450, reason: "x", now: created });
  // 22:59 UTC = 23:59 Berlin (CET): still the same day.
  assert.equal((await claimDaily(platformDb, sub, new Date("2026-03-28T22:59:00Z"))).granted, 0);
  // 23:00 UTC = 00:00 Berlin next day.
  const next = await claimDaily(platformDb, sub, new Date("2026-03-28T23:00:00Z"));
  assert.deepEqual(next, { granted: 250, balance: 300 });
  assert.deepEqual(await claimDaily(platformDb, sub, new Date("2026-03-29T12:00:00Z")), { granted: 0, balance: 300 });

  // Concurrent claims on the following day grant once.
  await bookTransaction(platformDb, { sub, app: "saga", idempotencyKey: "s2", kind: "spend", amount: -100, reason: "x", now: created });
  const day3 = new Date("2026-03-29T22:30:00Z"); // 00:30 CEST on the 30th
  const results = await Promise.all(Array.from({ length: 10 }, () => claimDaily(platformDb, sub, day3)));
  assert.equal(results.reduce((s, r) => s + r.granted, 0), 100);

  // Higher balance: nothing granted, day consumed.
  await bookTransaction(platformDb, { sub, app: "saga", idempotencyKey: "g1", kind: "grant", amount: 1000, reason: "x", now: created });
  assert.deepEqual(await claimDaily(platformDb, sub, new Date("2026-03-30T23:00:00Z")), { granted: 0, balance: 1300 });

  const res = await postDaily(await signedRequest("play", "POST", `/api/v1/wallet/${sub}/daily`), ctx({ sub }));
  assert.equal(res.status, 200);
  await assertLedgerBalanced();
});

test("50 parallel spends never overdraw and the ledger balances to zero", async () => {
  const sub = uuid();
  await seedUser(sub, "dora");
  await getBalance(platformDb, sub); // 500
  const attempts = Array.from({ length: 50 }, (_, i) =>
    bookTransaction(platformDb, { sub, app: "saga", idempotencyKey: `p-${i}`, kind: "spend", amount: -30, reason: "parallel" })
      .then(() => "ok" as const)
      .catch((e: unknown) => {
        if (e instanceof InsufficientFundsError) return "402" as const;
        throw e;
      })
  );
  const outcomes = await Promise.all(attempts);
  assert.equal(outcomes.filter((o) => o === "ok").length, 16); // 16 × 30 = 480 ≤ 500
  assert.equal(outcomes.filter((o) => o === "402").length, 34);
  assert.equal(await getBalance(platformDb, sub), 20);

  // Same idempotency key in parallel books once.
  const same = await Promise.all(
    Array.from({ length: 20 }, () =>
      bookTransaction(platformDb, { sub, app: "saga", idempotencyKey: "same", kind: "grant", amount: 7, reason: "x" })
    )
  );
  assert.equal(same.filter((r) => !r.duplicate).length, 1);
  assert.equal(await getBalance(platformDb, sub), 27);

  const [account] = await platformDb.select().from(platformWalletAccounts).where(eq(platformWalletAccounts.sub, sub));
  const entries = await platformDb.select().from(platformWalletEntries).where(eq(platformWalletEntries.accountId, account.id));
  assert.ok(entries.every((e) => e.balanceAfter >= 0), "balanceAfter never negative for the user");
  await assertLedgerBalanced();
});
