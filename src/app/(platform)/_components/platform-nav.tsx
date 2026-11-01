"use client";

import { Award, Bell, Settings, UserRound, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { useT } from "./i18n-provider";

export function PlatformNav({ profileHref, unread }: { profileHref: string | null; unread: number }) {
  const t = useT("nav");
  const pathname = usePathname();
  const items = [
    ...(profileHref ? [{ href: profileHref, label: t("profile"), icon: UserRound, match: "/u/" }] : []),
    { href: "/freunde", label: t("friends"), icon: Users, match: "/freunde" },
    { href: "/benachrichtigungen", label: t("notifications"), icon: Bell, match: "/benachrichtigungen", count: unread },
    { href: "/wallet", label: t("wallet"), icon: Wallet, match: "/wallet" },
    { href: "/abzeichen", label: t("badges"), icon: Award, match: "/abzeichen" },
    { href: "/einstellungen", label: t("settings"), icon: Settings, match: "/einstellungen" },
  ];
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = pathname?.startsWith(item.match);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  active
                    ? "border-[var(--tretu-accent)] bg-[var(--tretu-accent)] text-white"
                    : "border-border/70 bg-card/80 text-foreground hover:border-[var(--tretu-accent)]/50 hover:text-[var(--tretu-accent)]"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
                {item.count ? (
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                      active ? "bg-white/25 text-white" : "bg-[var(--tretu-accent)] text-white"
                    )}
                  >
                    {item.count > 99 ? "99+" : item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
