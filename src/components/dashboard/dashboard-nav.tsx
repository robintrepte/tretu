"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type LinkItem = { href: string; label: string; title: string };

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "";

  const links: LinkItem[] = [
    { href: "/dashboard", label: "Übersicht", title: "Alle Server auf einen Blick" },
    { href: "/dashboard/new", label: "Neue Instanz", title: "Neuen Server anlegen" },
  ];
  if (isAdmin) {
    links.push({ href: "/dashboard/activity", label: "Aktivität", title: "Hintergrundjobs" });
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/games/");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-card/60 p-1.5 shadow-sm backdrop-blur-sm dark:bg-card/40"
      aria-label="Dashboard"
    >
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.title}
          className={cn(
            "rounded-xl px-3.5 py-2 text-sm transition-colors",
            isActive(item.href)
              ? "bg-[var(--tretu-accent)] text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
