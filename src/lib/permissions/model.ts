import type { Permission, Role } from "@/lib/permissions/types";

const OPERATOR: Permission[] = [
  "dashboard:view",
  "instances:create",
  "instances:update",
  "instances:delete",
  "instances:start",
  "instances:stop",
  "instances:restart",
  "instances:delete-host",
  "instances:backup",
  "instances:restore",
  "instances:config",
  "instances:version",
  "instances:mods",
  "instances:console",
  "instances:files",
];

export const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  admin: new Set([...OPERATOR, "settings:manage", "roles:manage"]),
  operator: new Set(OPERATOR),
  manager: new Set([
    "dashboard:view",
    "instances:start",
    "instances:stop",
    "instances:restart",
    "instances:backup",
  ]),
  user: new Set(),
};
