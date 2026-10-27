"use client";

import { useEffect, useRef, useState } from "react";

import { dashboardApi } from "@/lib/api/dashboard-client";

export function JobLog({ instanceId, jobId, live }: { instanceId: number; jobId: number; live: boolean }) {
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
        if (live && (job.status === "running" || job.status === "queued")) timer = setTimeout(load, 2000);
      } catch {
        if (!cancelled && live) timer = setTimeout(load, 4000);
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
      {log.trim() || "Noch keine Ausgabe…"}
    </pre>
  );
}
