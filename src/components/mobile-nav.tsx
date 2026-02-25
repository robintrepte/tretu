"use client";

import Link from "next/link";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

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

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden size-11 min-w-11 min-h-11 text-header-fg hover:bg-black/5 dark:hover:bg-white/10 hover:text-header-fg"
          aria-label="Menü öffnen"
        >
          <svg className="size-8 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="mobile-menu-sheet w-full max-w-full sm:max-w-full h-full min-h-dvh bg-background border-0 text-foreground p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200"
      >
        <nav className="flex h-full flex-col items-center justify-center px-8 py-12 text-center" aria-label="Mobile Menü">
          <ul className="flex flex-col items-center gap-2">
            {navItems.map((item) => (
              <li key={item.href} className="w-full max-w-xs">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-6 py-5 text-3xl font-medium uppercase tracking-wide text-foreground transition-colors hover:bg-muted hover:text-[var(--tretu-accent)] active:bg-muted"
                >
                  {item.label}
                </Link>
                {item.children?.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-8 py-4 text-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--tretu-accent)] active:bg-muted"
                  >
                    {child.label}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
          <ul className="mt-12 flex items-center justify-center gap-8" aria-label="Soziale Netzwerke">
            {socialLinks.map(({ href, label, icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground transition-colors hover:text-[var(--tretu-accent)]"
                  aria-label={label}
                >
                  {icon === "twitch" && (
                    <svg className="size-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                    </svg>
                  )}
                  {icon === "youtube" && (
                    <svg className="size-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  )}
                  {icon === "facebook" && (
                    <svg className="size-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
