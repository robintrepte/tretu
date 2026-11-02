/**
 * State of the Tretu-Konto mirrored onto the local user (central admin spec, "Roles" and "Account lock"):
 *
 * - The Tretu `admin` role grants the local `admin` role when `TRETU_ADMIN_FROM_ROLES` is not `false`. Such a
 *   grant is stored with `user_roles.source = 'tretu'` and removed again when a later Tretu login or an auth
 *   `user.updated` event no longer carries `admin`. Roles granted here (`source = 'local'`) are never touched.
 * - `users.tretu_roles` keeps the last seen `roles` claim; the central admin pages require `admin` in it.
 * - `locked: true` in `user.updated` ends every local session of that user and refuses new ones until unlocked.
 *
 * Runs on the core database (sign-in hook) and inside the platform's event transaction (same database), so it
 * only uses query-builder calls both drizzle clients share.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { authSessions, roles, userRoles, users } from "@/db/schema";
import { log } from "@/lib/observability/logger";

/** Any drizzle Postgres client or transaction over this database (core or platform schema typing). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = PgDatabase<PostgresJsQueryResultHKT, any, any>;

export const TRETU_ADMIN_ROLE = "admin";
export type RoleSource = "local" | "tretu";

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/** `TRETU_ADMIN_FROM_ROLES` (default on): the Tretu `admin` claim grants the local admin role. */
export function adminFromRolesEnabled(): boolean {
  return flag(process.env.TRETU_ADMIN_FROM_ROLES, true);
}

async function roleId(db: AnyDb, key: string): Promise<number> {
  await db.insert(roles).values({ key }).onConflictDoNothing({ target: roles.key });
  const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  if (!row) throw new Error(`role ${key} missing`);
  return row.id;
}

/**
 * Grants `role`. A local grant always wins (an existing Tretu-sourced row becomes local, so it is never removed
 * automatically); a Tretu grant never downgrades an existing local one.
 */
export async function grantRoleWithSource(db: AnyDb, userId: number, role: string, source: RoleSource): Promise<void> {
  const id = await roleId(db, role);
  const insert = db.insert(userRoles).values({ userId, roleId: id, source });
  if (source === "local") {
    await insert.onConflictDoUpdate({ target: [userRoles.userId, userRoles.roleId], set: { source: "local" } });
  } else {
    await insert.onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
  }
}

/** Removes `role` only where it was granted from the Tretu claim. Returns whether a row was removed. */
export async function revokeTretuRole(db: AnyDb, userId: number, role: string): Promise<boolean> {
  const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, role)).limit(1);
  if (!row) return false;
  const deleted = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, row.id), eq(userRoles.source, "tretu")))
    .returning({ userId: userRoles.userId });
  return deleted.length > 0;
}

/**
 * Applies the `roles` claim of the Tretu-Konto to local user `userId`. `claimRoles === undefined` (claim not
 * present) changes nothing. Returns what happened to the local admin role.
 */
export async function applyTretuRoles(
  db: AnyDb,
  userId: number,
  claimRoles: readonly string[] | null | undefined,
  options: { adminFromRoles?: boolean } = {}
): Promise<"granted" | "removed" | "unchanged"> {
  if (claimRoles === undefined) return "unchanged";
  const list = [...new Set((claimRoles ?? []).filter((r) => typeof r === "string" && r.length <= 64))].slice(0, 50);
  await db.update(users).set({ tretuRoles: list }).where(eq(users.id, userId));
  const enabled = options.adminFromRoles ?? adminFromRolesEnabled();
  if (enabled && list.includes(TRETU_ADMIN_ROLE)) {
    await grantRoleWithSource(db, userId, TRETU_ADMIN_ROLE, "tretu");
    return "granted";
  }
  // Claim gone (or no longer trusted): only the grant that came from it is taken back.
  if (await revokeTretuRole(db, userId, TRETU_ADMIN_ROLE)) {
    log("info", "auth.tretu_admin_removed", { userId });
    return "removed";
  }
  return "unchanged";
}

export type LockState = { locked: boolean; until: Date | null };

/** Whether a stored lock is in effect at `now` (a temporary lock ends by itself at `until`). */
export function isLockActive(lockedAt: Date | null | undefined, until: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lockedAt) return false;
  return !until || until.getTime() > now.getTime();
}

/** Ends every local session of `userId`. Returns the number of sessions removed. */
export async function endLocalSessions(db: AnyDb, userId: number): Promise<number> {
  const deleted = await db.delete(authSessions).where(eq(authSessions.userId, userId)).returning({ id: authSessions.id });
  return deleted.length;
}

/** Applies auth's lock state to local user `userId`; a lock ends every local session. */
export async function applyTretuLock(db: AnyDb, userId: number, state: LockState, now: Date = new Date()): Promise<{ sessionsEnded: number }> {
  if (!state.locked) {
    await db.update(users).set({ tretuLockedAt: null, tretuLockedUntil: null }).where(eq(users.id, userId));
    return { sessionsEnded: 0 };
  }
  await db
    .update(users)
    .set({ tretuLockedAt: sql`coalesce(${users.tretuLockedAt}, ${now.toISOString()}::timestamptz)`, tretuLockedUntil: state.until })
    .where(eq(users.id, userId));
  const sessionsEnded = isLockActive(now, state.until, now) ? await endLocalSessions(db, userId) : 0;
  if (sessionsEnded) log("info", "auth.tretu_locked_sessions_ended", { userId, sessions: sessionsEnded });
  return { sessionsEnded };
}

/** True when `userId` must not get a session (Tretu-Konto locked). Never throws. */
export async function isUserLocked(db: AnyDb, userId: number, now: Date = new Date()): Promise<boolean> {
  try {
    const [row] = await db
      .select({ lockedAt: users.tretuLockedAt, until: users.tretuLockedUntil })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return Boolean(row && isLockActive(row.lockedAt, row.until, now));
  } catch (error) {
    log("error", "auth.lock_check_failed", { error: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

const tableCheck = new Map<string, boolean>();

/** The hub's `users` table exists in this database (the platform test database has only `platform_*`). */
async function hasHubTables(db: AnyDb): Promise<boolean> {
  const key = process.env.DATABASE_URL ?? "";
  const cached = tableCheck.get(key);
  if (cached !== undefined) return cached;
  const rows = (await db.execute(sql`select to_regclass('public.users') is not null as present`)) as unknown as { present: boolean }[];
  const present = Boolean(rows[0]?.present);
  tableCheck.set(key, present);
  return present;
}

export type AuthAccountState = {
  roles?: readonly string[] | null;
  locked?: boolean | null;
  lockedUntil?: string | null;
};

/**
 * `user.updated` / `user.created` from auth (platform event transaction): mirrors roles and the lock onto
 * the local user with that `tretu_sub`. Users who never signed in here are skipped.
 */
export async function applyAuthAccountState(db: AnyDb, sub: string, state: AuthAccountState, now: Date = new Date()): Promise<void> {
  if (!(await hasHubTables(db))) return;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.tretuSub, sub)).limit(1);
  if (!user) return;
  if (state.roles !== undefined) await applyTretuRoles(db, user.id, state.roles ?? []);
  if (state.locked !== undefined && state.locked !== null) {
    const until = state.lockedUntil ? new Date(state.lockedUntil) : null;
    await applyTretuLock(db, user.id, { locked: state.locked, until: until && !Number.isNaN(until.getTime()) ? until : null }, now);
  }
}
