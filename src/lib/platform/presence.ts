/**
 * Presence (contract §5): apps PUT every 60 s while the user is active; an entry expires 120 s after
 * the last PUT. One row per (sub, app); readers get the best entry ("playing" beats "online", then
 * the most recent).
 */
import { and, eq, gt, inArray, lte } from "drizzle-orm";

import { platformPresence } from "@/db/platform-schema";
import { type Executor } from "@/lib/platform/db";

export const PRESENCE_TTL_MS = 120_000;

export type PresenceInput = { status: "online" | "playing"; activity?: string | null; joinUrl?: string | null };
export type PresenceInfo = {
  app: string;
  status: "online" | "playing";
  activity: string | null;
  joinUrl: string | null;
  updatedAt: string;
};

export async function setPresence(
  db: Executor,
  sub: string,
  app: string,
  input: PresenceInput,
  now: Date = new Date()
): Promise<void> {
  const values = {
    status: input.status,
    activity: input.activity ?? null,
    joinUrl: input.joinUrl ?? null,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + PRESENCE_TTL_MS),
  };
  await db
    .insert(platformPresence)
    .values({ sub, app, ...values })
    .onConflictDoUpdate({ target: [platformPresence.sub, platformPresence.app], set: values });
}

export async function clearPresence(db: Executor, sub: string, app: string): Promise<void> {
  await db.delete(platformPresence).where(and(eq(platformPresence.sub, sub), eq(platformPresence.app, app)));
}

export async function getPresence(
  db: Executor,
  subs: string[],
  now: Date = new Date()
): Promise<Record<string, PresenceInfo>> {
  const unique = [...new Set(subs)].filter(Boolean);
  if (!unique.length) return {};
  const rows = await db
    .select()
    .from(platformPresence)
    .where(and(inArray(platformPresence.sub, unique), gt(platformPresence.expiresAt, now)));
  const best: Record<string, (typeof rows)[number]> = {};
  for (const row of rows) {
    const current = best[row.sub];
    const rank = (r: typeof row) => (r.status === "playing" ? 1 : 0);
    if (
      !current ||
      rank(row) > rank(current) ||
      (rank(row) === rank(current) && row.updatedAt.getTime() > current.updatedAt.getTime())
    ) {
      best[row.sub] = row;
    }
  }
  return Object.fromEntries(
    Object.entries(best).map(([sub, r]) => [
      sub,
      {
        app: r.app,
        status: r.status === "playing" ? "playing" : "online",
        activity: r.activity,
        joinUrl: r.joinUrl,
        updatedAt: r.updatedAt.toISOString(),
      },
    ])
  );
}

/** Deletes expired rows (worker). Returns how many were removed. */
export async function expirePresence(db: Executor, now: Date = new Date()): Promise<number> {
  const removed = await db
    .delete(platformPresence)
    .where(lte(platformPresence.expiresAt, now))
    .returning({ sub: platformPresence.sub });
  return removed.length;
}
