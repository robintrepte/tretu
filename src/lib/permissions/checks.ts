import { eq } from "drizzle-orm";

import { db } from "@/db";
import { roles, userRoles } from "@/db/schema";
import { ROLE_PERMISSIONS } from "@/lib/permissions/model";
import type { Permission, Role } from "@/lib/permissions/types";

function getRoles(userId: string): Role[] {
  const numericId = Number(userId);
  if (!Number.isFinite(numericId)) return [];

  return db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, numericId))
    .all()
    .map((row) => row.key as Role);
}

export function hasAnyDashboardRole(userId: string): boolean {
  return getRoles(userId).some((role) => role === "admin" || role === "operator" || role === "manager");
}

export function hasPermission(userId: string, permission: Permission): boolean {
  return getRoles(userId).some((role) => ROLE_PERMISSIONS[role].has(permission));
}

export function hasRole(userId: string, role: Role): boolean {
  return getRoles(userId).includes(role);
}

export function seedDefaultRoles(): void {
  const existing = db.select({ key: roles.key }).from(roles).all().map((r) => r.key);
  const requiredRoles: Role[] = ["admin", "operator", "manager", "user"];
  const missing = requiredRoles.filter((role) => !existing.includes(role));
  if (missing.length > 0) {
    db.insert(roles)
      .values(missing.map((key) => ({ key })))
      .run();
  }
}

export function getUserRoles(userId: string): Role[] {
  return getRoles(userId);
}

export function getPermissions(userId: string): Permission[] {
  const set = new Set<Permission>();
  for (const role of getRoles(userId)) for (const p of ROLE_PERMISSIONS[role]) set.add(p);
  return [...set];
}

/** Replaces the roles of a user. */
export function setUserRoles(userId: number, nextRoles: Role[]): void {
  seedDefaultRoles();
  const roleRows = db.select().from(roles).all();
  db.transaction((tx) => {
    tx.delete(userRoles).where(eq(userRoles.userId, userId)).run();
    for (const key of new Set(nextRoles)) {
      const role = roleRows.find((r) => r.key === key);
      if (role) tx.insert(userRoles).values({ userId, roleId: role.id }).run();
    }
  });
}

export function grantRole(userId: number, role: Role): void {
  if (getRoles(String(userId)).includes(role)) return;
  seedDefaultRoles();
  const row = db.select().from(roles).where(eq(roles.key, role)).get();
  if (row) db.insert(userRoles).values({ userId, roleId: row.id }).onConflictDoNothing().run();
}
