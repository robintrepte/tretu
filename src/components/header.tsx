"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { HeaderLogo } from "@/components/header-logo";
import { MobileNav } from "@/components/mobile-nav";

const navItems = [
  { label: "Teamspeak", href: "/teamspeak/", children: [{ label: "Ranking & Stats", href: "/ranking/" }] },
  { label: "Discord", href: "/discord/" },
  { label: "Livestream", href: "/live/" },
  { label: "Videos", href: "/videos/" },
  { label: "Minecraft Map", href: "/map/" },
];

const socialLinks = [
  { label: "Twitch", href: "https://www.twitch.tv/TretuDE", icon: "twitch" },
  { label: "YouTube", href: "https://www.youtube.com/c/Tretu", icon: "youtube" },
  { label: "Facebook", href: "https://www.facebook.com/TretuDE/", icon: "facebook" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-header-bg text-header-fg transition-[background-color] duration-200 ${scrolled ? "header-scrolled" : ""}`}
    >
      <div className="flex w-full items-center justify-between gap-6 px-4 py-[27px] md:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0" aria-label="Tretu">
          <HeaderLogo />
        </Link>
        <nav className="hidden flex-1 items-center justify-center md:flex" aria-label="Hauptmenü">
          <ul className="flex flex-wrap items-center justify-center gap-1 text-sm uppercase tracking-wide md:gap-4">
            {navItems.map((item) => (
              <li key={item.href} className="relative group">
                {item.children ? (
                  <>
                    <Link
                      href={item.href}
                      className="flex items-center px-2 py-2 text-header-fg transition-colors hover:text-[var(--tretu-accent)] md:px-3"
                    >
                      {item.label}
                    </Link>
                    <ul className="absolute left-0 top-full hidden min-w-[180px] rounded border border-border bg-background py-1 shadow-lg group-hover:block">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className="block px-4 py-2 text-foreground hover:bg-muted hover:text-[var(--tretu-accent)]"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Link
                    href={item.href}
                    className="block px-2 py-2 text-header-fg transition-colors hover:text-[var(--tretu-accent)] md:px-3"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <MobileNav />
          <ul className="hidden items-center gap-6 md:flex" aria-label="Soziale Netzwerke">
          {socialLinks.map(({ href, label, icon }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-header-fg transition-colors hover:text-[var(--tretu-accent)]"
                aria-label={label}
              >
                {icon === "twitch" && (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                  </svg>
                )}
                {icon === "youtube" && (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                )}
                {icon === "facebook" && (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                )}
              </a>
            </li>
          ))}
          </ul>
        </div>
      </div>
    </header>
  );
}
