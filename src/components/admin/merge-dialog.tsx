"use client";

import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mergeAction, previewMergeAction } from "@/app/(internal)/dashboard/admin/actions";
import type { MergeSummary } from "@/lib/admin/merge-summary";

type Preview = { summary: MergeSummary };

/**
 * Two steps (the first runs on open when both accounts are given): a dry-run preview from auth (what moves, what is dropped), then the merge itself with a required
 * reason. Changing either account discards the preview.
 */
export function MergeDialog({
  from: initialFrom = "",
  into: initialInto = "",
  trigger,
  testId,
}: {
  from?: string;
  into?: string;
  trigger: string;
  testId?: string;
}) {
  const t = useTranslations("admin.merge");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const ids = { from: useId(), into: useId(), reason: useId() };
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initialFrom);
  const [into, setInto] = useState(initialInto);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "merge" | null>(null);
  const [error, setError] = useState<{ error: string; detail?: string } | null>(null);

  const reset = () => {
    setPreview(null);
    setError(null);
  };

  async function loadPreview(fromValue = from, intoValue = into) {
    setBusy("preview");
    reset();
    try {
      const result = await previewMergeAction({ from: fromValue.trim(), into: intoValue.trim() });
      if (result.ok) setPreview({ summary: result.summary });
      else setError({ error: result.error, detail: result.detail });
    } catch {
      setError({ error: tc("networkError") });
    } finally {
      setBusy(null);
    }
  }

  async function merge() {
    setBusy("merge");
    setError(null);
    try {
      const form = new FormData();
      form.set("from", from.trim());
      form.set("into", into.trim());
      form.set("reason", reason);
      const result = await mergeAction(form);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        setError({ error: result.error, detail: result.detail });
      }
    } catch {
      setError({ error: tc("networkError") });
    } finally {
      setBusy(null);
    }
  }

  const list = (items: string[]) => (items.length ? items.join(", ") : t("nothing"));
  const s = preview?.summary;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (next) {
          setFrom(initialFrom);
          setInto(initialInto);
          setReason("");
          reset();
          // Both accounts known (legacy list): the preview loads right away.
          if (initialFrom && initialInto) void loadPreview(initialFrom, initialInto);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl" data-testid={testId}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-pretty">{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor={ids.from}>{t("from")}</Label>
            <Input id={ids.from} value={from} placeholder={t("subPlaceholder")} data-testid="merge-from" onChange={(e) => { setFrom(e.target.value); reset(); }} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("swap")}
            title={t("swap")}
            onClick={() => {
              setFrom(into);
              setInto(from);
              reset();
            }}
          >
            <ArrowLeftRight />
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor={ids.into}>{t("into")}</Label>
            <Input id={ids.into} value={into} placeholder={t("subPlaceholder")} data-testid="merge-into" onChange={(e) => { setInto(e.target.value); reset(); }} />
          </div>
        </div>
        <div>
          <Button type="button" variant="secondary" size="sm" className="rounded-xl" disabled={!from.trim() || !into.trim() || busy !== null} onClick={() => void loadPreview()} data-testid="merge-preview">
            {busy === "preview" ? <Loader2 className="animate-spin" /> : null}
            {busy === "preview" ? t("previewing") : t("preview")}
          </Button>
        </div>
        {s ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3.5 text-sm" data-testid="merge-summary">
            <p className="font-medium">{t("previewTitle")}</p>
            <p className="text-muted-foreground">{t("direction", { from: s.from, into: s.into })}</p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>{t("moveProviders", { list: list(s.move.providers) })}</li>
              <li>{t("moveGameLinks", { list: list(s.move.gameLinks) })}</li>
              <li>{t("movePasskeys", { count: s.move.passkeys })}</li>
              <li>{t("moveLegacy", { list: list(s.move.legacy) })}</li>
              {s.drop.providers.length ? <li>{t("dropProviders", { list: list(s.drop.providers) })}</li> : null}
              {s.drop.gameLinks.length ? <li>{t("dropGameLinks", { list: list(s.drop.gameLinks) })}</li> : null}
              <li>{t("deleted", { name: s.from, sessions: s.fromSessions })}</li>
              {s.fromUsedByApps ? <li>{t("usedByApps", { name: s.from })}</li> : null}
            </ul>
          </div>
        ) : null}
        {preview ? (
          <div className="space-y-1.5">
            <Label htmlFor={ids.reason}>{tc("reason")}</Label>
            <Textarea id={ids.reason} value={reason} rows={3} maxLength={500} placeholder={tc("reasonPlaceholder")} data-testid="admin-reason" onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-800 dark:text-red-200">
            <p>{error.error}</p>
            {error.detail ? <p className="mt-1 text-xs opacity-80">{error.detail}</p> : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-xl" disabled={busy !== null} onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-xl"
            disabled={!preview || reason.trim().length < 3 || busy !== null}
            onClick={() => void merge()}
            data-testid="merge-confirm"
          >
            {busy === "merge" ? <Loader2 className="animate-spin" /> : null}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
