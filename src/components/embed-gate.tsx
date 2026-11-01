"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export type EmbedProvider = "twitch" | "discord" | "tsviewer";

const PROVIDER_NAMES: Record<EmbedProvider, string> = {
  twitch: "Twitch",
  discord: "Discord",
  tsviewer: "TSViewer",
};

const STORAGE_KEY = "tretu-embeds";

function readAllowed(): EmbedProvider[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed.filter((p) => typeof p === "string") as EmbedProvider[]) : [];
  } catch {
    return [];
  }
}

function remember(provider: EmbedProvider) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...readAllowed(), provider])]));
  } catch {
    // storage blocked: the content still loads for this visit
  }
}

/**
 * Two-click solution: third-party content (and its cookies) only loads after the visitor asks for it
 * (§ 25 TDDDG). "Always load" stores that choice for this provider in local storage.
 */
export function EmbedGate({
  provider,
  minHeight = 400,
  children,
}: {
  provider: EmbedProvider;
  minHeight?: number;
  children: ReactNode;
}) {
  const t = useTranslations("embeds");
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    setAllowed(readAllowed().includes(provider));
  }, [provider]);

  if (allowed) return <>{children}</>;
  const name = PROVIDER_NAMES[provider];

  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center"
      style={{ minHeight }}
    >
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        {t.rich("notice", {
          provider: name,
          link: (chunks) => (
            <Link href="/datenschutz#einbindungen" className="underline underline-offset-2 hover:text-[var(--tretu-accent)]">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
          disabled={allowed === null}
          onClick={() => setAllowed(true)}
        >
          {t("load", { provider: name })}
        </Button>
        <Button
          variant="outline"
          disabled={allowed === null}
          onClick={() => {
            remember(provider);
            setAllowed(true);
          }}
        >
          {t("always", { provider: name })}
        </Button>
      </div>
    </div>
  );
}
