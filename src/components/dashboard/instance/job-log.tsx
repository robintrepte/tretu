"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { dashboardApi } from "@/lib/api/dashboard-client";

export function JobLog({ instanceId, jobId, live }: { instanceId: number; jobId: number; live: boolean }) {
  const t = useTranslations("dashboard.instance");
  const [log, setLog] = useState<string>("");
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;
    const load = async () => {
      try {
        const job = await dashboardApi<{ log: string; status: string }>(
          `/api/internal/dashboard/instances/${instanceId}/jobs/${jobId}`
        );
        if (cancelled) return;
        setLog(job.log);
        if (live && (job.status === "running" || job.status === "queued")) timer = setTimeout(() => void load(), 2000);
      } catch {
        if (!cancelled && live) timer = setTimeout(() => void load(), 4000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [instanceId, jobId, live]);

  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <pre
      ref={ref}
      className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-200"
    >
      {log.trim() || t("noOutput")}
    </pre>
  );
}
