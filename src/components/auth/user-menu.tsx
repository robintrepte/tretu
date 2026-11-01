"use client";

import { ExternalLink, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";

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

export function UserMenu({ state, triggerClassName }: { state: UserMenuState; triggerClassName?: string }) {
  const t = useTranslations("userMenu");
  const [busy, setBusy] = useState(false);

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={triggerClassName} aria-label={t("open", { name: state.name })} title={state.name}>
          <Avatar name={state.name} image={state.image} className="size-7 text-xs md:size-6" />
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
