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
