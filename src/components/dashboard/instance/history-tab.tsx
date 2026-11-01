"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useInstance } from "@/components/dashboard/instance/instance-context";
import { JobLog } from "@/components/dashboard/instance/job-log";
import { Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { useFormat } from "@/components/dashboard/use-format";
import { cn } from "@/lib/utils";

const VARIANT: Record<string, "secondary" | "warning" | "danger" | "success"> = {
  queued: "secondary",
  running: "warning",
  failed: "danger",
  succeeded: "success",
  cancelled: "secondary",
};

export function HistoryTab() {
  const t = useTranslations("dashboard");
  const format = useFormat();
  const { detail } = useInstance();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Panel title={t("history.title")} description={t("history.intro")}>
      {detail.recentJobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {detail.recentJobs.map((job) => (
            <li key={job.id} className="overflow-hidden rounded-xl border border-border/60">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                onClick={() => setOpen((o) => (o === job.id ? null : job.id))}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.has(`actions.${job.actionType}`) ? t(`actions.${job.actionType}`) : job.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {format.dateTime(job.createdAt)}
                    {job.requestedBy ? ` · ${job.requestedBy}` : ""}
                    {job.error ? ` · ${job.error}` : ""}
                  </span>
                </span>
                <Badge variant={VARIANT[job.status] ?? "secondary"}>{t.has(`jobStatus.${job.status}`) ? t(`jobStatus.${job.status}`) : job.status}</Badge>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open === job.id && "rotate-180")} />
              </button>
              {open === job.id ? (
                <div className="border-t border-border/60 p-3">
                  <JobLog instanceId={detail.id} jobId={job.id} live={job.status === "running" || job.status === "queued"} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
