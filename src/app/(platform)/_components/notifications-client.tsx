"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/platform/format";
import type { NotificationItem } from "@/lib/platform/notifications";
import { cn } from "@/lib/utils";

import { meApi } from "./api";
import { PlatformIcon } from "./badge-icon";
import { useLocale, useT } from "./i18n-provider";

type Page = { items: NotificationItem[]; unreadCount: number };

export function NotificationsClient({ initial, initialUnread }: { initial: NotificationItem[]; initialUnread: number }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [hasMore, setHasMore] = useState(initial.length >= 30);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function load(nextFilter: "all" | "unread", before?: string) {
    try {
      const qs = new URLSearchParams({ limit: "30", ...(nextFilter === "unread" ? { unread: "true" } : {}), ...(before ? { before } : {}) });
      const page = await meApi<Page>(`/notifications?${qs}`);
      setItems((prev) => (before ? [...prev, ...page.items] : page.items));
      setUnread(page.unreadCount);
      setHasMore(page.items.length >= 30);
    } catch {
      toast.error(t("common.error"));
    }
  }

  async function markRead(ids: string[] | "all") {
    try {
      const res = await meApi<{ unreadCount: number }>("/notifications/read", {
        method: "POST",
        body: ids === "all" ? { all: true } : { ids },
      });
      const stamp = new Date().toISOString();
      setItems((prev) =>
        filter === "unread"
          ? prev.filter((n) => ids !== "all" && !ids.includes(n.id))
          : prev.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? stamp } : n))
      );
      setUnread(res.unreadCount);
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    }
  }

  function open(n: NotificationItem) {
    if (!n.readAt) void markRead([n.id]);
    if (!n.url) return;
    if (n.url.startsWith("/")) router.push(n.url);
    else window.open(n.url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="tablist">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => {
                setFilter(f);
                void load(f);
              }}
              className={cn(
                "h-8 rounded-full border px-3 text-sm font-medium transition-colors",
                filter === f ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"
              )}
            >
              {f === "all" ? t("notifications.filterAll") : t("notifications.filterUnread")}
            </button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{t("notifications.unread", { count: unread })}</span>
        </div>
        <Button variant="outline" size="sm" disabled={unread === 0} onClick={() => markRead("all")}>
          <CheckCheck aria-hidden />
          {t("notifications.markAll")}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-muted-foreground">{t("notifications.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <div
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm transition-colors",
                  n.readAt ? "border-border/70" : "border-[var(--tretu-accent)]/40 bg-[var(--tretu-accent)]/[0.04]"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full",
                    n.readAt ? "bg-muted text-muted-foreground" : "bg-[var(--tretu-accent)]/15 text-[var(--tretu-accent)]"
                  )}
                >
                  <PlatformIcon name={n.icon} fallback="Bell" className="size-5" />
                </span>
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left" disabled={!n.url && Boolean(n.readAt)}>
                  <p className={cn("leading-snug", n.readAt ? "font-medium" : "font-semibold")}>{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`apps.${n.app}`) === `apps.${n.app}` ? n.app : t(`apps.${n.app}`)} · {relativeTime(t, locale, n.createdAt, now)}
                  </p>
                </button>
                {!n.readAt ? (
                  <button
                    type="button"
                    onClick={() => markRead([n.id])}
                    className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--tretu-accent)] hover:bg-muted"
                    aria-label={t("notifications.markRead")}
                    title={t("notifications.markRead")}
                  >
                    <span className="size-2.5 rounded-full bg-current" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {hasMore && items.length > 0 ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => load(filter, items[items.length - 1]?.id)}>
            {t("notifications.loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
