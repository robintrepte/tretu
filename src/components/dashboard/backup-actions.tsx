"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { dashboardApiErrorMessage, readDashboardJson } from "@/lib/api/dashboard-client";

export function BackupActions({ instanceId }: { instanceId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const makeIdempotencyKey = (actionType: string) =>
    `${instanceId}-${actionType}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const queueAction = (actionType: "backup" | "restore") => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/internal/dashboard/instances/${instanceId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType,
            idempotencyKey: makeIdempotencyKey(actionType),
            payload: {},
          }),
        });

        const body = await readDashboardJson(res);

        if (!res.ok) {
          toast.error(dashboardApiErrorMessage(res, body));
          return;
        }

        toast.success(
          actionType === "backup"
            ? "Backup wurde in die Warteschlange gestellt."
            : "Wiederherstellen wurde in die Warteschlange gestellt."
        );
        router.refresh();
      } catch {
        toast.error("Netzwerkfehler – bitte erneut versuchen.");
      }
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4 dark:bg-muted/10 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold">Backups</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Backup sichert eine Momentaufnahme des laufenden Servers – vorher Spiel lieber stoppen. Wiederherstellen
          geht nur, wenn das bei euch entsprechend eingerichtet ist.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <Button disabled={pending} variant="outline" className="rounded-xl" onClick={() => queueAction("backup")}>
          Backup
        </Button>
        <Button disabled={pending} variant="outline" className="rounded-xl" onClick={() => queueAction("restore")}>
          Wiederherstellen
        </Button>
      </div>
    </div>
  );
}
