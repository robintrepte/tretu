"use client";

import { Archive, Download, History, Plus, Trash2 } from "lucide-react";

import { useInstance } from "@/components/dashboard/instance/instance-context";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDateTime } from "@/lib/dashboard/format";

const KIND_LABELS: Record<string, string> = {
  manuell: "Manuell",
  auto: "Beim Ausschalten",
  "auto-leerlauf": "Auto-Aus (Leerlauf)",
  "vor-reset": "Vor Zurücksetzen",
  gefunden: "Importiert",
};

export function BackupsTab() {
  const { detail, can, runAction } = useInstance();
  const hostUp = Boolean(detail.ip);
  const busy = detail.state === "busy";

  return (
    <Panel
      title="Backups"
      description={`Backups liegen auf dem Server-Speicher (behalte die letzten ${detail.backupRetention}). Herunterladen für eine Kopie auf deinem Rechner.`}
      actions={
        <Button
          disabled={!hostUp || busy || !can("instances:backup")}
          onClick={() => runAction("backup", { success: "Backup wird erstellt." })}
          className="rounded-xl"
        >
          <Plus /> Backup erstellen
        </Button>
      }
    >
      {!hostUp ? (
        <div className="mb-4">
          <Hint>Backups erstellen, wiederherstellen und herunterladen geht, während der Server läuft.</Hint>
        </div>
      ) : null}
      {detail.backups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
          <Archive className="size-6" />
          Noch keine Backups.
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {detail.backups.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Archive className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{formatDateTime(b.createdAt)}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABELS[b.kind] ?? b.kind} · {formatBytes(b.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {hostUp && can("instances:backup") ? (
                  <Button asChild variant="ghost" size="sm">
                    <a href={`/api/internal/dashboard/instances/${detail.id}/backups/${b.id}/download`}>
                      <Download /> Download
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hostUp || busy || !can("instances:restore")}
                  onClick={() =>
                    runAction("restore", {
                      payload: { backupId: b.id },
                      success: "Backup wird eingespielt.",
                      confirm: {
                        title: "Backup wiederherstellen?",
                        description: `Der Server wird gestoppt und der Stand vom ${formatDateTime(b.createdAt)} eingespielt. Aktuelle Änderungen seit diesem Backup gehen verloren – erstelle vorher ggf. ein neues Backup.`,
                        confirmLabel: "Wiederherstellen",
                        destructive: true,
                      },
                    })
                  }
                >
                  <History /> Wiederherstellen
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-600 hover:bg-red-500/10"
                  aria-label="Backup löschen"
                  disabled={!hostUp || busy || !can("instances:restore")}
                  onClick={() =>
                    runAction("deleteBackup", {
                      payload: { backupId: b.id },
                      success: "Backup wird gelöscht.",
                      confirm: {
                        title: "Backup löschen?",
                        description: `Das Backup vom ${formatDateTime(b.createdAt)} wird endgültig gelöscht.`,
                        confirmLabel: "Löschen",
                        destructive: true,
                      },
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
