"use client";

import { Archive, Download, History, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useInstance } from "@/components/dashboard/instance/instance-context";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/components/dashboard/use-format";

/** Backup kinds as stored in `game_backups.kind` → message keys. */
const KIND_KEYS: Record<string, string> = {
  manuell: "manual",
  auto: "auto",
  "auto-leerlauf": "idle",
  "vor-reset": "beforeReset",
  gefunden: "imported",
};

export function BackupsTab() {
  const t = useTranslations("dashboard.backups");
  const tDash = useTranslations("dashboard");
  const format = useFormat();
  const { detail, can, runAction } = useInstance();
  const hostUp = Boolean(detail.ip);
  const busy = detail.state === "busy";

  return (
    <Panel
      title={t("title")}
      description={t("intro", { count: detail.backupRetention })}
      actions={
        <Button
          disabled={!hostUp || busy || !can("instances:backup")}
          onClick={() => runAction("backup", { success: t("creating") })}
          className="rounded-xl"
        >
          <Plus /> {tDash("actions.backup")}
        </Button>
      }
    >
      {!hostUp ? (
        <div className="mb-4">
          <Hint>{t("onlyWhenRunning")}</Hint>
        </div>
      ) : null}
      {detail.backups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
          <Archive className="size-6" />
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {detail.backups.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Archive className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{format.dateTime(b.createdAt)}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_KEYS[b.kind] ? t(`kinds.${KIND_KEYS[b.kind]}`) : b.kind} · {format.bytes(b.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {hostUp && can("instances:backup") ? (
                  <Button asChild variant="ghost" size="sm">
                    <a href={`/api/internal/dashboard/instances/${detail.id}/backups/${b.id}/download`}>
                      <Download /> {t("download")}
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
                      success: t("restoring"),
                      confirm: {
                        title: t("restoreTitle"),
                        description: t("restoreText", { date: format.dateTime(b.createdAt) }),
                        confirmLabel: t("restore"),
                        destructive: true,
                      },
                    })
                  }
                >
                  <History /> {t("restore")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-600 hover:bg-red-500/10"
                  aria-label={tDash("actions.deleteBackup")}
                  disabled={!hostUp || busy || !can("instances:restore")}
                  onClick={() =>
                    runAction("deleteBackup", {
                      payload: { backupId: b.id },
                      success: t("deleting"),
                      confirm: {
                        title: t("deleteTitle"),
                        description: t("deleteText", { date: format.dateTime(b.createdAt) }),
                        confirmLabel: t("delete"),
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
