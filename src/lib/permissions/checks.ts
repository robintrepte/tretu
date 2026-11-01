import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { roles, userRoles } from "@/db/schema";
import { ROLE_PERMISSIONS } from "@/lib/permissions/model";
import { ROLES, type Permission, type Role } from "@/lib/permissions/types";

function toNumericId(userId: string | number): number | null {
  const numericId = Number(userId);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

async function getRoles(userId: string | number): Promise<Role[]> {
  const numericId = toNumericId(userId);
  if (numericId === null) return [];

  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, numericId));
  return rows.map((row) => row.key).filter((key): key is Role => (ROLES as readonly string[]).includes(key));
}

export async function hasAnyDashboardRole(userId: string | number): Promise<boolean> {
  return (await getRoles(userId)).some((role) => role === "admin" || role === "operator" || role === "manager");
}

export async function hasPermission(userId: string | number, permission: Permission): Promise<boolean> {
  return (await getRoles(userId)).some((role) => ROLE_PERMISSIONS[role].has(permission));
}

export async function hasRole(userId: string | number, role: Role): Promise<boolean> {
  return (await getRoles(userId)).includes(role);
}

/** Inserts missing default roles (idempotent, safe under concurrency). */
export async function seedDefaultRoles(): Promise<void> {
  await db
    .insert(roles)
    .values(ROLES.map((key) => ({ key })))
    .onConflictDoNothing({ target: roles.key });
}

export async function getUserRoles(userId: string | number): Promise<Role[]> {
  return getRoles(userId);
}

/** Roles for many users at once (team list). */
export async function getRolesForUsers(userIds: number[]): Promise<Map<number, Role[]>> {
  const result = new Map<number, Role[]>();
  if (!userIds.length) return result;
  const rows = await db
    .select({ userId: userRoles.userId, key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, [...new Set(userIds)]));
  for (const row of rows) {
    if (!(ROLES as readonly string[]).includes(row.key)) continue;
    const list = result.get(row.userId) ?? [];
    list.push(row.key as Role);
    result.set(row.userId, list);
  }
  return result;
}

export async function getPermissions(userId: string | number): Promise<Permission[]> {
  const set = new Set<Permission>();
  for (const role of await getRoles(userId)) for (const p of ROLE_PERMISSIONS[role]) set.add(p);
  return [...set];
}

/** Replaces the roles of a user (atomically). */
export async function setUserRoles(userId: number, nextRoles: Role[]): Promise<void> {
  await seedDefaultRoles();
  const roleRows = await db.select().from(roles);
  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    const values = [...new Set(nextRoles)]
      .map((key) => roleRows.find((r) => r.key === key))
      .filter((role): role is (typeof roleRows)[number] => Boolean(role))
      .map((role) => ({ userId, roleId: role.id }));
    if (values.length) await tx.insert(userRoles).values(values);
  });
}

export async function grantRole(userId: number, role: Role): Promise<void> {
  await seedDefaultRoles();
  const [row] = await db.select().from(roles).where(eq(roles.key, role)).limit(1);
  if (row) await db.insert(userRoles).values({ userId, roleId: row.id }).onConflictDoNothing();
}
