"use client"

import { Check, ShieldAlert } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { confirmUsername } from "@/app/konto/actions"
import { Alert } from "@/components/ui/alert"
import { Button, buttonClass } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { authClient } from "@/lib/client/auth-client"

const KNOWN_SCOPES = ["openid", "profile", "email", "offline_access", "tretu"] as const

export function ConsentForm({ clientName, scopes, userName }: { clientName: string; scopes: string[]; userName: string }) {
  const t = useTranslations("consent")
  const tc = useTranslations("common")
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null)
  const [error, setError] = useState(false)
  async function decide(accept: boolean) {
    setBusy(accept ? "allow" : "deny")
    const { error: err } = await authClient.oauth2.consent({ accept })
    if (err) {
      setBusy(null)
      setError(true)
    }
  }
  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{tc("genericError")}</Alert>}
      <p className="text-sm text-muted-foreground">{t("signedInAs", { name: userName })}</p>
      <div>
        <p className="mb-2 text-sm font-medium">{t("scopesIntro", { client: clientName })}</p>
        <ul className="space-y-2">
          {KNOWN_SCOPES.filter((s) => scopes.includes(s)).map((scope) => (
            <li key={scope} className="flex items-start gap-2 text-[15px]">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" />
              {t(`scopes.${scope}`)}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" loading={busy === "deny"} disabled={busy !== null} onClick={() => decide(false)}>
          {t("deny")}
        </Button>
        <Button size="lg" loading={busy === "allow"} disabled={busy !== null} onClick={() => decide(true)}>
          {t("allow")}
        </Button>
      </div>
    </div>
  )
}

export function ContinueStep({
  usernamePending,
  suggestedUsername,
  needs2fa,
  securityHref,
}: {
  usernamePending: boolean
  suggestedUsername: string
  needs2fa: boolean
  securityHref: string
}) {
  const t = useTranslations("continuePage")
  const tp = useTranslations("profile")
  const tc = useTranslations("common")
  const [username, setUsername] = useState(suggestedUsername)
  const [pending, setPending] = useState(usernamePending)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  async function resume() {
    setBusy(true)
    const { error: err } = await authClient.oauth2.continue({ postLogin: true })
    if (err) {
      setBusy(false)
      setError(tc("genericError"))
    }
  }

  useEffect(() => {
    if (!pending && !needs2fa && !started.current) {
      started.current = true
      void resume()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once nothing is left to do
  }, [pending, needs2fa])

  async function onUsername(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await confirmUsername(username)
    setBusy(false)
    if (!result.ok) return setError(result.error === "taken" ? tp("errors.usernameTaken") : tp("errors.usernameInvalid"))
    setPending(false)
  }

  if (pending) {
    return (
      <form onSubmit={onUsername} className="space-y-4">
        <p className="text-[15px] text-muted-foreground">{t("usernameText")}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={tc("username")} htmlFor="username">
          <Input id="username" autoCapitalize="none" spellCheck={false} maxLength={24} required value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t("usernameSubmit")}
        </Button>
      </form>
    )
  }
  if (needs2fa) {
    return (
      <div className="space-y-5">
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <ShieldAlert className="size-4" /> {t("adminTitle")}
          </span>
          <p className="mt-1">{t("adminText")}</p>
        </Alert>
        <Link href={securityHref as "/konto"} className={buttonClass("primary", "lg", "w-full")}>
          {t("adminSetup")}
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : <Alert tone="success">{t("done")}</Alert>}
      <Button className="w-full" size="lg" loading={busy} onClick={resume}>
        {t("continue")}
      </Button>
    </div>
  )
}
