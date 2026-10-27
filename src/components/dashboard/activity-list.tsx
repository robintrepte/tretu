import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dashboard/format";
import { JOB_STATUS_LABELS } from "@/lib/orchestrator/action-types";

type Item = {
  id: number;
  instanceId: number;
  createdAt: string;
  title: string;
  subtitle: string;
  status: string;
};

const VARIANT: Record<string, "secondary" | "warning" | "danger" | "success"> = {
  queued: "secondary",
  running: "warning",
  failed: "danger",
  succeeded: "success",
  cancelled: "secondary",
};

export function ActivityList({ items }: { items: Item[] }) {
  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground dark:bg-muted/10">
        Noch nichts passiert. Sobald im Dashboard etwas ausgelöst wird, erscheint es hier.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card/80 dark:bg-card/40">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link href={`/dashboard/games/${item.instanceId}#history`} className="text-sm font-medium hover:underline">
              {item.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {formatDateTime(item.createdAt)}
              {item.subtitle ? ` · ${item.subtitle}` : ""}
            </p>
          </div>
          <Badge variant={VARIANT[item.status] ?? "secondary"}>{JOB_STATUS_LABELS[item.status] ?? item.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
