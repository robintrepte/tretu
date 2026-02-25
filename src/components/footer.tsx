"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export function Footer() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const year = new Date().getFullYear();
  return (
    <footer className="w-full bg-footer-bg text-footer-fg">
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <p className="text-sm">© 2011–{year} Tretu</p>
          {!isHome && <ThemeToggle />}
        </div>
        <nav className="flex items-center gap-4 text-sm" aria-label="Rechtliches">
          <Link
            href="/impressum/"
            className="hover:text-[var(--tretu-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)] focus:ring-offset-2 focus:ring-offset-background"
          >
            Impressum
          </Link>
          <Link
            href="/datenschutz/"
            className="hover:text-[var(--tretu-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)] focus:ring-offset-2 focus:ring-offset-background"
          >
            Datenschutz
          </Link>
        </nav>
      </div>
    </footer>
  );
}
