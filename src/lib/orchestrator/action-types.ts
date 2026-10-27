/** Client-safe list of dashboard job types. */
export const ACTION_TYPES = [
  "start",
  "stop",
  "restart",
  "apply",
  "hibernate",
  "backup",
  "restore",
  "deleteBackup",
  "resizeVolume",
  "wipe",
  "destroy",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABELS: Record<string, string> = {
  start: "Starten",
  stop: "Spiel stoppen",
  restart: "Neustart",
  apply: "Einstellungen anwenden",
  hibernate: "Ausschalten",
  backup: "Backup erstellen",
  restore: "Backup wiederherstellen",
  deleteBackup: "Backup löschen",
  resizeVolume: "Speicher vergrößern",
  wipe: "Daten zurücksetzen",
  destroy: "Server endgültig löschen",
  // pre-overhaul job types that may still be in the history
  createVolume: "Speicher anlegen",
  provision: "Einrichten",
  deleteHost: "VM löschen",
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "Wartet",
  running: "Läuft",
  succeeded: "Fertig",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};
