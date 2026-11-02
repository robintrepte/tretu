"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard/admin", key: "overview" },
  { href: "/dashboard/admin/konten", key: "accounts" },
  { href: "/dashboard/admin/altkonten", key: "legacy" },
  { href: "/dashboard/admin/wallet", key: "wallet" },
  { href: "/dashboard/admin/abzeichen", key: "badges" },
  { href: "/dashboard/admin/protokoll", key: "audit" },
] as const;

/** Second navigation row of the central admin (same look as the dashboard navigation, smaller). */
export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname() ?? "";
  const isActive = (href: string) =>
    href === "/dashboard/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1 text-sm dark:bg-card/30"
      aria-label={t("label")}
    >
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 transition-colors",
            isActive(item.href)
              ? "bg-foreground/90 text-background shadow-sm dark:bg-foreground/85"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
