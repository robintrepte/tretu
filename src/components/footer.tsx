"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

const linkClass =
  "hover:text-[var(--tretu-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)] focus:ring-offset-2 focus:ring-offset-background";

export function Footer() {
  const t = useTranslations("footer");
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <nav className="flex flex-wrap items-center gap-4 text-sm" aria-label={t("legal")}>
            <Link href="/impressum/" className={linkClass}>
              {t("imprint")}
            </Link>
            <Link href="/datenschutz/" className={linkClass}>
              {t("privacy")}
            </Link>
            <Link href="/agb/" className={linkClass}>
              {t("terms")}
            </Link>
            <Link href="/status" className={linkClass}>
              {t("status")}
            </Link>
          </nav>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
