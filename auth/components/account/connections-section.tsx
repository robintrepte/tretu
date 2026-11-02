"use client"

import { ExternalLink, Headphones, Pickaxe } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, type ReactNode } from "react"
import { unlinkGameAccount } from "@/app/konto/actions"
import { providerIcons, providerNames, SteamIcon } from "@/components/provider-icons"
import { Alert } from "@/components/ui/alert"
import { Button, buttonClass } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { authClient } from "@/lib/client/auth-client"
import { errorCode } from "@/lib/client/errors"
import { startSteam } from "@/lib/client/steam"

type Provider = "discord" | "google" | "apple"
type Linked = Record<string, { id: string; accountId: string; displayName: string | null }>

/** Error codes the Steam/provider flows bring back to /konto?tab=konten&error=… */
const NOTICES = new Set(["account_already_linked_to_different_user", "steam_already_linked", "steam_failed", "state_mismatch", "access_denied"])

export function ConnectionsSection({
  enabled,
  steamEnabled,
  linked,
  hasPasskey,
  hasPassword,
  games,
  linkUrls,
  notice,
}: {
  enabled: Provider[]
  steamEnabled: boolean
  linked: Linked
  hasPasskey: boolean
  hasPassword: boolean
  games: { provider: "minecraft" | "teamspeak"; id: string; displayName: string | null }[]
  linkUrls: { minecraft: string; teamspeak: string }
  notice: string | null
}) {
  const t = useTranslations("connections")
  const tc = useTranslations("common")
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(() => (notice && NOTICES.has(notice) ? t(`errors.${notice}` as "errors.steam_failed") : null))
  const linkedProviders = Object.keys(linked)
  // Only providers that can still be used here, plus ones linked earlier (they can be disconnected).
  const shown = [...new Set<Provider>([...enabled, ...(linkedProviders.filter((p) => p in providerNames && p !== "steam") as Provider[])])]
  /** Another way to sign in remains without this provider (any other linked account incl. password, or a passkey). */
  const canUnlink = (provider: string) => hasPasskey || hasPassword || linkedProviders.some((p) => p !== provider)

  async function unlink(provider: string) {
    const row = linked[provider]
    if (!row) return
    setBusy(provider)
    setError(null)
    const { error: err } = await authClient.unlinkAccount({ accountId: row.id })
    setBusy(null)
    if (err) {
      const code = errorCode(err)
      setError(code === "FAILED_TO_UNLINK_LAST_ACCOUNT" ? t("lastMethod") : code === "SESSION_NOT_FRESH" || code === "SESSION_EXPIRED" ? t("reauth") : tc("genericError"))
      return
    }
    router.refresh()
  }

  const steam = linked.steam
  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      <Card>
        <CardHeader title={t("title")} description={t("description")} />
        <ul className="divide-y rounded-xl border">
          {shown.map((provider) => {
            const Icon = providerIcons[provider]
            const isLinked = provider in linked
            const locked = isLinked && !canUnlink(provider)
            return (
              <li key={provider} className="flex items-center gap-3 px-4 py-3.5" data-testid={`connection-${provider}`}>
                <Icon className={provider === "discord" ? "size-6 text-[#5865F2]" : "size-6"} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{providerNames[provider]}</div>
                  <div className="text-sm text-muted-foreground">{isLinked ? t("connected") : t("notConnected")}</div>
                </div>
                {isLinked ? (
                  <Button variant="outline" size="sm" loading={busy === provider} disabled={locked} title={locked ? t("lastMethod") : undefined} onClick={() => unlink(provider)}>
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
        {linkedProviders.length > 0 && !linkedProviders.some((p) => canUnlink(p)) && <p className="mt-3 text-sm text-muted-foreground">{t("lastMethod")}</p>}
      </Card>

      <Card>
        <CardHeader title={t("gamesTitle")} description={t("gamesDescription")} />
        <ul className="divide-y rounded-xl border">
          {(["minecraft", "teamspeak"] as const).map((provider) => {
            const link = games.find((g) => g.provider === provider)
            const Icon = provider === "minecraft" ? Pickaxe : Headphones
            return (
              <GameRow
                key={provider}
                testId={`game-${provider}`}
                icon={<Icon className="size-6 text-muted-foreground" />}
                title={t(provider)}
                hint={t(`hints.${provider}`)}
                value={link ? `${link.displayName ? `${link.displayName} · ` : ""}${link.id}` : null}
                action={
                  link ? (
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
                  ) : (
                    <a href={linkUrls[provider]} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                      {t("link")}
                      <ExternalLink className="size-3.5" />
                    </a>
                  )
                }
              />
            )
          })}
          {(steamEnabled || steam) && (
            <GameRow
              testId="game-steam"
              icon={<SteamIcon className="size-6 text-[#1b2838] dark:text-[#c7d5e0]" />}
              title={t("steam")}
              hint={t("hints.steam")}
              value={steam ? `${steam.displayName ? `${steam.displayName} · ` : ""}${steam.accountId}` : null}
              action={
                steam ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busy === "steam"}
                    disabled={!canUnlink("steam")}
                    title={!canUnlink("steam") ? t("lastMethod") : undefined}
                    onClick={() => {
                      if (window.confirm(t("unlinkConfirm"))) void unlink("steam")
                    }}
                  >
                    {t("disconnect")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy === "steam"}
                    onClick={async () => {
                      setBusy("steam")
                      setError(null)
                      const { error: err } = await startSteam({ link: true, callbackURL: "/konto?tab=konten", errorCallbackURL: "/konto?tab=konten" })
                      if (err) {
                        setBusy(null)
                        setError(tc("genericError"))
                      }
                    }}
                  >
                    {t("link")}
                  </Button>
                )
              }
            />
          )}
        </ul>
      </Card>
    </>
  )
}

function GameRow({ testId, icon, title, hint, value, action }: { testId: string; icon: ReactNode; title: string; hint: string; value: string | null; action: ReactNode }) {
  const t = useTranslations("connections")
  return (
    <li className="flex items-center gap-3 px-4 py-3.5" data-testid={testId}>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="truncate text-sm text-muted-foreground">{value ?? t("notConnected")}</div>
        {!value && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      {action}
    </li>
  )
}
