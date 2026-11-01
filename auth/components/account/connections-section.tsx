"use client"

import { Gamepad2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { unlinkGameAccount } from "@/app/konto/actions"
import { providerIcons, providerNames } from "@/components/provider-icons"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { authClient } from "@/lib/client/auth-client"

type Provider = "discord" | "google" | "apple"

export function ConnectionsSection({
  enabled,
  linked,
  canRemoveLast,
  games,
}: {
  enabled: Provider[]
  linked: Record<string, string>
  canRemoveLast: boolean
  games: { provider: "minecraft" | "steam"; id: string; displayName: string | null }[]
}) {
  const t = useTranslations("connections")
  const tc = useTranslations("common")
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const linkedProviders = Object.keys(linked)
  // Only providers that can still be used here, plus ones linked earlier (they can be disconnected).
  const shown = [...new Set<Provider>([...enabled, ...(linkedProviders.filter((p) => p in providerNames) as Provider[])])]
  const onlyMethod = !canRemoveLast && linkedProviders.length <= 1

  return (
    <>
      <Card>
        <CardHeader title={t("title")} description={t("description")} />
        {error && <Alert tone="error" className="mb-4">{error}</Alert>}
        <ul className="divide-y rounded-xl border">
          {shown.map((provider) => {
            const Icon = providerIcons[provider]
            const isLinked = provider in linked
            return (
              <li key={provider} className="flex items-center gap-3 px-4 py-3.5">
                <Icon className={provider === "discord" ? "size-6 text-[#5865F2]" : "size-6"} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{providerNames[provider]}</div>
                  <div className="text-sm text-muted-foreground">{isLinked ? t("connected") : t("notConnected")}</div>
                </div>
                {isLinked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busy === provider}
                    disabled={onlyMethod}
                    title={onlyMethod ? t("lastMethod") : undefined}
                    onClick={async () => {
                      setBusy(provider)
                      setError(null)
                      const { error: err } = await authClient.unlinkAccount({ accountId: linked[provider]! })
                      setBusy(null)
                      if (err) setError(tc("genericError"))
                      router.refresh()
                    }}
                  >
                    {t("disconnect")}
                  </Button>
                ) : (
                  enabled.includes(provider) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === provider}
                      onClick={async () => {
                        setBusy(provider)
                        await authClient.linkSocial({ provider, callbackURL: "/konto?tab=konten", errorCallbackURL: "/fehler" })
                      }}
                    >
                      {t("connect")}
                    </Button>
                  )
                )}
              </li>
            )
          })}
        </ul>
        {onlyMethod && <p className="mt-3 text-sm text-muted-foreground">{t("lastMethod")}</p>}
      </Card>

      <Card>
        <CardHeader title={t("gamesTitle")} description={t("gamesDescription")} />
        <ul className="divide-y rounded-xl border">
          {(["minecraft", "steam"] as const).map((provider) => {
            const link = games.find((g) => g.provider === provider)
            return (
              <li key={provider} className="flex items-center gap-3 px-4 py-3.5">
                <Gamepad2 className="size-6 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t(provider)}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {link ? `${link.displayName ? `${link.displayName} · ` : ""}${link.id}` : t("notConnected")}
                  </div>
                </div>
                {link && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busy === provider}
                    onClick={async () => {
                      if (!window.confirm(t("unlinkConfirm"))) return
                      setBusy(provider)
                      await unlinkGameAccount(provider)
                      setBusy(null)
                      router.refresh()
                    }}
                  >
                    {t("disconnect")}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
