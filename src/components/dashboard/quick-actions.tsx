"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dashboardApiErrorMessage, readDashboardJson } from "@/lib/api/dashboard-client";

const NETWORK_ERROR = "Netzwerkfehler – bitte erneut versuchen.";

export function QuickActions({ instanceId }: { instanceId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const makeIdempotencyKey = (actionType: string) =>
    `${instanceId}-${actionType}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  async function safeQueueAction(
    actionType: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
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
        return { ok: false, error: dashboardApiErrorMessage(res, body) };
      }

      return { ok: true };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  const runQueued = (actionType: string) => {
    startTransition(async () => {
      const result = await safeQueueAction(actionType);
      if (result.ok) {
        toast.success("Aktion wurde in die Warteschlange gestellt und kann kurz dauern.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const confirmDelete = () => {
    startTransition(async () => {
      const result = await safeQueueAction("deleteHost");
      if (result.ok) {
        setDeleteDialogOpen(false);
        toast.success("Löschen wurde in die Warteschlange gestellt. Das kann einen Moment dauern.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4 dark:bg-muted/15 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold">Server &amp; Spiel</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Die Knöpfe stellen Jobs in die Warteschlange – die Ausführung kann kurz dauern. „Start“ fährt bei Bedarf den
          Server hoch und startet das Spiel. „Server löschen“ entfernt nur die laufende Umgebung; Welten und Daten auf dem
          Speicher bleiben in der Regel erhalten.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <Button disabled={pending} className="rounded-xl shadow-sm" onClick={() => runQueued("start")}>
          Start
        </Button>
        <Button disabled={pending} variant="outline" className="rounded-xl" onClick={() => runQueued("stop")}>
          Stop
        </Button>
        <Button disabled={pending} variant="outline" className="rounded-xl" onClick={() => runQueued("restart")}>
          Neustart
        </Button>
        <Button
          type="button"
          disabled={pending}
          variant="destructive"
          className="rounded-xl"
          onClick={() => setDeleteDialogOpen(true)}
        >
          Server löschen
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent showCloseButton className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Server-Umgebung löschen?</DialogTitle>
            <DialogDescription className="text-pretty">
              Die laufende Server-VM wird entfernt. Welten und Daten auf dem dauerhaften Speicher bleiben in der Regel
              erhalten. Ohne passende Rollen-Freigabe schlägt die Aktion fehl – dann erscheint eine Meldung.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={pending}
              onClick={() => setDeleteDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={pending}
              onClick={confirmDelete}
            >
              {pending ? "Wird gestellt…" : "Ja, löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
