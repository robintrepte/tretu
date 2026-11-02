"use client"

import { History, Link2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState, type FormEvent } from "react"
import { claimLegacyAccount, startOAuthClaim } from "@/app/konto/actions"
import { providerIcons, providerNames } from "@/components/provider-icons"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { authClient } from "@/lib/client/auth-client"
import { startSteam } from "@/lib/client/steam"

const APPS = ["saga", "play", "hollowmere", "tretu-web"] as const

export function LegacySection({
  connected,
  until,
  open,
  providers,
  notice,
}: {
  connected: { app: string; name: string }[]
  until: string | null
  open: boolean
  providers: ("discord" | "google" | "steam")[]
  notice: string | null
}) {
  const t = useTranslations("legacy")
  const tc = useTranslations("common")
  const format = useFormatter()
  const router = useRouter()
  const [app, setApp] = useState<(typeof APPS)[number]>("saga")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(notice === "oauthFailed" ? { tone: "error", text: t("errors.oauthFailed") } : null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy("password")
    setStatus(null)
    const result = await claimLegacyAccount({ app, identifier, password })
    setBusy(null)
    if (result.ok) {
      setPassword("")
      setIdentifier("")
      setStatus({ tone: "success", text: t("success", { app: t(`apps.${result.app}`), name: result.legacyName }) })
      router.refresh()
    } else {
      setStatus({ tone: "error", text: result.error === "rateLimited" ? tc("rateLimited") : t(`errors.${result.error}`) })
    }
  }

  async function onOAuth(provider: "discord" | "google" | "steam") {
    setBusy(provider)
    const started = await startOAuthClaim(provider)
    if (!started.ok) return setBusy(null)
    const target = { callbackURL: "/konto/alte-konten/abschluss", errorCallbackURL: "/konto?tab=alte-konten&claim=oauthFailed" }
    // Steam (Hollowmere accounts signed in with Steam) proves the identity the same way, through Steam's own flow.
    if (provider === "steam") {
      if ((await startSteam(target)).error) setBusy(null)
      return
    }
    await authClient.signIn.social({ provider, ...target })
  }

  return (
    <>
      <Card>
        <CardHeader title={t("title")} description={t("description")} />
        {!open ? (
          <Alert>{t("expired")}</Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {until && <p className="text-sm text-muted-foreground">{t("until", { date: format.dateTime(new Date(until), { dateStyle: "long" }) })}</p>}
            {status && <Alert tone={status.tone}>{status.text}</Alert>}
            <Field label={t("app")} htmlFor="legacy-app">
              <select
                id="legacy-app"
                value={app}
                onChange={(e) => setApp(e.target.value as (typeof APPS)[number])}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/20"
              >
                {APPS.filter((a) => a !== "tretu-web").map((a) => (
                  <option key={a} value={a}>
                    {t(`apps.${a}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("identifier")} htmlFor="legacy-identifier">
              <Input id="legacy-identifier" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </Field>
            <Field label={t("oldPassword")} htmlFor="legacy-password">
              <PasswordInput id="legacy-password" autoComplete="off" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy === "password"}>
              <Link2 className="size-4" />
              {t("submit")}
            </Button>
          </form>
        )}
      </Card>

      {open && providers.length > 0 && (
        <Card>
          <CardHeader title={t("oauthTitle")} description={t("oauthText")} />
          <div className="flex flex-wrap gap-2.5">
            {providers.map((provider) => {
              const Icon = providerIcons[provider]
              return (
                <Button key={provider} variant="outline" loading={busy === provider} disabled={busy !== null} onClick={() => onOAuth(provider)}>
                  <Icon className={provider === "discord" ? "size-5 text-[#5865F2]" : "size-5"} />
                  {t("oauthButton", { provider: providerNames[provider] })}
                </Button>
              )
            })}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={t("connectedTitle")} />
        {connected.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noneConnected")}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {connected.map((c, i) => (
              <li key={`${c.app}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <History className="size-5 text-muted-foreground" />
                <span className="font-medium">{t(`apps.${c.app as (typeof APPS)[number]}`)}</span>
                <span className="truncate text-muted-foreground">{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
