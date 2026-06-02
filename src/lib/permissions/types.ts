export const ROLES = ["admin", "operator", "manager", "user"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
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
  "roles:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
