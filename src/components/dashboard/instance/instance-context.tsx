"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog, type ConfirmOptions } from "@/components/dashboard/confirm-dialog";
import { dashboardApi } from "@/lib/api/dashboard-client";
import type { InstanceDetail } from "@/lib/dashboard/view";
import type { ActionType } from "@/lib/orchestrator/action-types";
import type { Permission } from "@/lib/permissions/types";

type InstanceContextValue = {
  detail: InstanceDetail;
  can: (permission: Permission) => boolean;
  curseforgeAvailable: boolean;
  refresh: () => Promise<void>;
  /** Queues a job; asks for confirmation first when `confirm` is given. */
  runAction: (action: ActionType, opts?: { payload?: Record<string, unknown>; confirm?: ConfirmOptions; success?: string }) => void;
  confirm: (options: ConfirmOptions, onConfirm: () => Promise<void>) => void;
};

const InstanceContext = createContext<InstanceContextValue | null>(null);

export function useInstance() {
  const ctx = useContext(InstanceContext);
  if (!ctx) throw new Error("useInstance outside InstanceProvider");
  return ctx;
}

export function InstanceProvider({
  initial,
  permissions,
  curseforgeAvailable,
  children,
}: {
  initial: InstanceDetail;
  permissions: Permission[];
  curseforgeAvailable: boolean;
  children: ReactNode;
}) {
  const [detail, setDetail] = useState(initial);
  const [dialog, setDialog] = useState<{ options: ConfirmOptions; onConfirm: () => Promise<void> } | null>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDetail(await dashboardApi<InstanceDetail>(`/api/internal/dashboard/instances/${initial.id}`));
    } catch {
      // keep showing the last known state; the next poll retries
    }
  }, [initial.id]);

  const fast = detail.state === "busy" || detail.state === "starting";
  useEffect(() => {
    const schedule = () => {
      timer.current = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        schedule();
      }, fast ? 2500 : 10_000);
    };
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fast, refresh]);

  const queue = useCallback(
    async (action: ActionType, payload?: Record<string, unknown>, success?: string) => {
      try {
        const res = await dashboardApi<{ deduplicated: boolean }>(`/api/internal/dashboard/instances/${initial.id}/actions`, {
          method: "POST",
          json: { action, payload: payload ?? {} },
        });
        toast.success(res.deduplicated ? "Ist bereits in Arbeit." : (success ?? "Aktion gestartet."));
        await refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    },
    [initial.id, refresh]
  );

  const value: InstanceContextValue = {
    detail,
    can: (p) => permissions.includes(p),
    curseforgeAvailable,
    refresh,
    runAction: (action, opts) => {
      if (opts?.confirm) {
        setDialog({
          options: opts.confirm,
          onConfirm: async () => {
            await queue(action, opts.payload, opts.success);
            setDialog(null);
          },
        });
      } else void queue(action, opts?.payload, opts?.success);
    },
    confirm: (options, onConfirm) =>
      setDialog({
        options,
        onConfirm: async () => {
          await onConfirm();
          setDialog(null);
        },
      }),
  };

  return (
    <InstanceContext.Provider value={value}>
      {children}
      <ConfirmDialog options={dialog?.options ?? null} onConfirm={() => dialog?.onConfirm()} onClose={() => setDialog(null)} />
    </InstanceContext.Provider>
  );
}
