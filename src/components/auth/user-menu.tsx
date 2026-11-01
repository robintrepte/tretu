"use client";

import { Bell, Coins, ExternalLink, LayoutDashboard, LogOut, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth/client";

export type UserMenuState = {
  name: string;
  image: string | null;
  canAccessDashboard: boolean;
  /** "Mein Konto" at auth.tretu.de, only when the Tretu-Konto login is configured. */
  accountUrl: string | null;
};

const itemClass =
  "flex cursor-pointer items-center gap-2 px-4 py-2 text-sm text-foreground outline-none hover:bg-muted hover:text-[var(--tretu-accent)] focus:bg-muted focus:text-[var(--tretu-accent)]";

/** Signs out locally and, when the session came from a Tretu-Konto, at auth.tretu.de as well. */
export async function signOutEverywhere() {
  const res = await authClient.signOut({ fetchOptions: { body: { callbackURL: "/" } } });
  const url = (res.data as { url?: string } | null)?.url;
  window.location.assign(url || "/");
}

function Avatar({ name, image, className }: { name: string; image: string | null; className?: string }) {
  if (image) {
    // Provider avatars come from Discord / auth.tretu.de, which next/image is not configured for.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={`rounded-full object-cover ${className ?? ""}`} referrerPolicy="no-referrer" />;
  }
  return (
    <span
      className={`flex items-center justify-center rounded-full bg-[var(--tretu-accent)] font-semibold text-white ${className ?? ""}`}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

type PlatformSummary = { profileUrl: string | null; unreadCount: number; balance: number | null };

/** Profile, friends, notifications and wallet from the platform API; null without a Tretu-Konto. */
function usePlatformSummary(enabled: boolean): PlatformSummary | null {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/v1/me", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { profileUrl?: string | null }; unreadCount?: number; balance?: number | null } | null) => {
        if (!data) return;
        setSummary({ profileUrl: data.user?.profileUrl ?? null, unreadCount: data.unreadCount ?? 0, balance: data.balance ?? null });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled]);
  return summary;
}

export function UserMenu({ state, triggerClassName }: { state: UserMenuState; triggerClassName?: string }) {
  const t = useTranslations("userMenu");
  const [busy, setBusy] = useState(false);
  const platform = usePlatformSummary(Boolean(state.accountUrl));

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={triggerClassName} aria-label={t("open", { name: state.name })} title={state.name}>
          <span className="relative inline-flex">
            <Avatar name={state.name} image={state.image} className="size-7 text-xs md:size-6" />
            {platform && platform.unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[var(--tretu-accent)] ring-2 ring-background" aria-hidden />
            ) : null}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="z-[60] min-w-[220px] rounded border border-border bg-background py-1 shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Avatar name={state.name} image={state.image} className="size-8 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{state.name}</p>
              <p className="text-xs text-muted-foreground">{t("signedIn")}</p>
            </div>
          </div>
          {state.canAccessDashboard ? (
            <DropdownMenu.Item asChild>
              <Link href="/dashboard/" className={itemClass}>
                <LayoutDashboard className="size-4" aria-hidden /> {t("dashboard")}
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {platform ? (
            <>
              {platform.profileUrl ? (
                <DropdownMenu.Item asChild>
                  <Link href={new URL(platform.profileUrl, "https://tretu.de").pathname} className={itemClass}>
                    <UserRound className="size-4" aria-hidden /> {t("profile")}
                  </Link>
                </DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Item asChild>
                <Link href="/benachrichtigungen" className={itemClass}>
                  <Bell className="size-4" aria-hidden /> {t("notifications")}
                  {platform.unreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-[var(--tretu-accent)] px-1.5 text-xs font-semibold text-white">
                      {platform.unreadCount > 99 ? "99+" : platform.unreadCount}
                    </span>
                  ) : null}
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/freunde" className={itemClass}>
                  <Users className="size-4" aria-hidden /> {t("friends")}
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/wallet" className={itemClass}>
                  <Coins className="size-4" aria-hidden /> {t("wallet")}
                  {platform.balance !== null ? (
                    <span className="ml-auto text-xs text-muted-foreground">{t("credits", { count: platform.balance })}</span>
                  ) : null}
                </Link>
              </DropdownMenu.Item>
            </>
          ) : null}
          {state.accountUrl ? (
            <DropdownMenu.Item asChild>
              <a href={state.accountUrl} className={itemClass}>
                <ExternalLink className="size-4" aria-hidden /> {t("account")}
              </a>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={itemClass}
            disabled={busy}
            onSelect={(event) => {
              event.preventDefault();
              setBusy(true);
              void signOutEverywhere().finally(() => setBusy(false));
            }}
          >
            <LogOut className="size-4" aria-hidden /> {busy ? t("signingOut") : t("signOut")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
