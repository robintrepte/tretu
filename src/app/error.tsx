"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { PageTitle } from "@/components/page-title";

/** Friendly error page for render errors below the root layout (header and footer stay). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("error");
  useEffect(() => {
    // Only the digest: the message may contain details that do not belong in a browser console.
    console.error("page error", error.digest ?? "");
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1200px] flex-col items-center justify-center px-4 py-16 text-center" role="alert">
      <PageTitle title={t("title")} />
      <p className="mt-2 max-w-xl text-muted-foreground">{t("message")}</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted-foreground">{t("reference", { digest: error.digest })}</p> : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[var(--tretu-accent)] px-4 py-2 font-medium text-white hover:bg-[var(--tretu-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)] focus:ring-offset-2"
        >
          {t("retry")}
        </button>
        <Link
          href="/"
          className="rounded px-4 py-2 text-foreground underline hover:text-[var(--tretu-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)]"
        >
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
