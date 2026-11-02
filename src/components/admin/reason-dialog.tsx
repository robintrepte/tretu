"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/app/(internal)/dashboard/admin/actions";

export const REASON_MIN_LENGTH = 3;

/**
 * Confirmation dialog for one admin mutation: a required reason (3–500 characters), optional extra fields
 * (`children`, plain form inputs) and hidden values. Submits the form to a server action; on success it closes,
 * shows a toast and refreshes the page data.
 */
export function ReasonDialog({
  action,
  hidden = {},
  trigger,
  triggerVariant = "outline",
  triggerSize = "sm",
  testId,
  title,
  description,
  confirmLabel,
  destructive = false,
  withRequestId = false,
  children,
}: {
  action: (form: FormData) => Promise<ActionResult>;
  hidden?: Record<string, string>;
  trigger: ReactNode;
  triggerVariant?: "outline" | "default" | "destructive" | "ghost" | "secondary";
  triggerSize?: "sm" | "default" | "xs";
  testId?: string;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Adds a fresh `requestId` (UUID) each time the dialog opens: idempotent bookings. */
  withRequestId?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("admin.common");
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ error: string; detail?: string } | null>(null);
  const [requestId, setRequestId] = useState("");

  const onOpenChange = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    setError(null);
    if (next && withRequestId) setRequestId(crypto.randomUUID());
  };

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const result = await action(form);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        setError({ error: result.error, detail: result.detail });
      }
    } catch {
      setError({ error: t("networkError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className="rounded-xl" data-testid={testId}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(new FormData(event.currentTarget));
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription asChild>
                <div className="space-y-2 text-pretty text-sm text-muted-foreground">{description}</div>
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {withRequestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
          {children ? <div className="space-y-3">{children}</div> : null}
          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>{t("reason")}</Label>
            <Textarea
              id={reasonId}
              name="reason"
              required
              minLength={REASON_MIN_LENGTH}
              maxLength={500}
              rows={3}
              placeholder={t("reasonPlaceholder")}
              data-testid="admin-reason"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
          </div>
          {error ? (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-800 dark:text-red-200">
              <p>{error.error}</p>
              {error.detail ? <p className="mt-1 text-xs opacity-80">{error.detail}</p> : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} className="rounded-xl" disabled={busy} data-testid="admin-confirm">
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? t("saving") : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
