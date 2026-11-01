"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocale } from "@/i18n/actions";
import { LOCALES } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Footer language switch (German / English); stored in the `NEXT_LOCALE` cookie. */
export function LanguageSwitcher() {
  const t = useTranslations("footer");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1 text-sm" role="group" aria-label={t("language")}>
      {LOCALES.map((code, index) => (
        <span key={code} className="flex items-center gap-1">
          {index > 0 ? <span aria-hidden className="opacity-40">/</span> : null}
          <button
            type="button"
            lang={code}
            disabled={pending || code === locale}
            aria-pressed={code === locale}
            onClick={() =>
              startTransition(async () => {
                await setLocale(code);
                router.refresh();
              })
            }
            className={cn(
              "rounded px-1 uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)]",
              code === locale ? "font-semibold" : "opacity-70 hover:text-[var(--tretu-accent)] hover:opacity-100"
            )}
            title={t(`languages.${code}`)}
          >
            {code}
          </button>
        </span>
      ))}
    </div>
  );
}
