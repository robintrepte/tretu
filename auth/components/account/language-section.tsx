"use client"

import { Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { updateLocale } from "@/app/konto/actions"
import { Alert } from "@/components/ui/alert"
import { Card, CardHeader } from "@/components/ui/card"
import { localeNames, locales, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"

export function LanguageSection({ locale }: { locale: Locale }) {
  const t = useTranslations("language")
  const router = useRouter()
  const [current, setCurrent] = useState(locale)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("title")}>
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={current === l}
            disabled={pending}
            lang={l}
            onClick={() =>
              startTransition(async () => {
                setCurrent(l)
                await updateLocale(l)
                setSaved(true)
                router.refresh()
              })
            }
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors",
              current === l ? "border-accent bg-accent-soft" : "hover:bg-muted",
            )}
          >
            <span className="font-medium">{localeNames[l]}</span>
            {current === l && <Check className="size-5 text-accent" />}
          </button>
        ))}
      </div>
      {saved && <Alert tone="success" className="mt-4">{t("saved")}</Alert>}
    </Card>
  )
}
