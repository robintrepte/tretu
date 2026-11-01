import { z } from "zod";

import { platformDb } from "@/lib/platform/db";
import { requireUser } from "@/lib/platform/directory";
import { PlatformError } from "@/lib/platform/errors";
import { json, parseBody, parseQuery, signedRoute } from "@/lib/platform/http";
import { UUID_PATTERN } from "@/lib/platform/notifications";
import { API_WALLET_KINDS, bookTransaction, listTransactions } from "@/lib/platform/wallet";

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().regex(UUID_PATTERN).optional(),
});

/** GET /api/v1/wallet/{sub}/transactions?limit=50&before=<id> → { items } */
export const GET = signedRoute<{ sub: string }>(async (_req, { params, url }) => {
  const user = await requireUser(platformDb, params.sub, { createStub: false });
  const query = parseQuery(url, listSchema);
  return json({ items: await listTransactions(platformDb, user.sub, { limit: query.limit ?? 50, before: query.before }) });
});

const bookSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  amount: z.number().int().refine((n) => n !== 0, "amount must not be 0").refine((n) => Math.abs(n) <= 10_000_000, "amount too large"),
  kind: z.enum(API_WALLET_KINDS),
  reason: z.string().min(1).max(300),
  ref: z.string().max(300).optional(),
});

/**
 * POST /api/v1/wallet/{sub}/transactions → 200 { transactionId, balance, duplicate }
 * 402 { error: "insufficient_funds", balance } when the balance would go negative.
 */
export const POST = signedRoute<{ sub: string }>(async (_req, { app, params, rawBody }) => {
  const body = parseBody(rawBody, bookSchema);
  if (body.amount < 0 && body.kind !== "spend" && body.kind !== "adjust") {
    throw new PlatformError(400, "invalid_amount", "Negative amounts are only allowed for spend and adjust.");
  }
  if (body.amount > 0 && body.kind === "spend") {
    throw new PlatformError(400, "invalid_amount", "spend amounts must be negative.");
  }
  const user = await requireUser(platformDb, params.sub);
  const result = await bookTransaction(platformDb, {
    sub: user.sub,
    app,
    idempotencyKey: body.idempotencyKey,
    kind: body.kind,
    amount: body.amount,
    reason: body.reason,
    ref: body.ref ?? null,
  });
  return json(result);
});
