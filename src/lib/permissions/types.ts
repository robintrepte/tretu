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
  "instances:console",
  "instances:files",
  "settings:manage",
  "roles:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Alles inkl. Einrichtung (Hetzner, Cloudflare) und Rollenvergabe." },
  operator: { label: "Operator", description: "Server anlegen, konfigurieren, löschen, Dateien & Konsole." },
  manager: { label: "Manager", description: "Server starten, ausschalten, neu starten, Backups erstellen." },
  user: { label: "Nutzer", description: "Kein Dashboard-Zugriff." },
};
