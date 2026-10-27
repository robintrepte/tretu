"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type ConfirmOptions = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Require typing this text to enable the confirm button. */
  typeToConfirm?: string;
};

export function ConfirmDialog({
  options,
  onConfirm,
  onClose,
}: {
  options: ConfirmOptions | null;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = Boolean(options?.typeToConfirm && typed.trim() !== options.typeToConfirm);

  return (
    <Dialog
      open={Boolean(options)}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setTyped("");
          onClose();
        }
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-pretty text-sm text-muted-foreground">{options?.description}</div>
          </DialogDescription>
        </DialogHeader>
        {options?.typeToConfirm ? (
          <div className="space-y-2">
            <p className="text-sm">
              Zum Bestätigen <span className="font-mono font-semibold">{options.typeToConfirm}</span> eingeben:
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant={options?.destructive ? "destructive" : "default"}
            className="rounded-xl"
            disabled={busy || blocked}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                setTyped("");
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {options?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
