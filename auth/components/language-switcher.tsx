"use client"

import { Globe } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { useTransition } from "react"
import { setLocale } from "@/app/actions"
import { localeNames, locales } from "@/i18n/locales"
import { cn } from "@/lib/utils"

export function LanguageSwitcher({ className }: { className?: string }) {
  const current = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <Globe className="size-3.5" aria-hidden />
      {locales.map((locale, i) => (
        <span key={locale} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          <button
            type="button"
            lang={locale}
            disabled={pending || locale === current}
            aria-pressed={locale === current}
            onClick={() =>
              startTransition(async () => {
                await setLocale(locale)
                router.refresh()
              })
            }
            className={cn("hover:text-foreground disabled:cursor-default", locale === current && "font-medium text-foreground")}
          >
            {localeNames[locale]}
          </button>
        </span>
      ))}
    </div>
  )
}
