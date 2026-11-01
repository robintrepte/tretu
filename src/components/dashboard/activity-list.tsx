"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { useFormat } from "@/components/dashboard/use-format";

import { Badge } from "@/components/ui/badge";

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
  const t = useTranslations("dashboard");
  const format = useFormat();
  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground dark:bg-muted/10">
        {t("activity.empty")}
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
              {format.dateTime(item.createdAt)}
              {item.subtitle ? ` · ${item.subtitle}` : ""}
            </p>
          </div>
          <Badge variant={VARIANT[item.status] ?? "secondary"}>{t.has(`jobStatus.${item.status}`) ? t(`jobStatus.${item.status}`) : item.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
