"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState, type FormEvent } from "react"
import { Alert } from "@/components/ui/alert"
import { Button, buttonClass } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { authClient } from "@/lib/client/auth-client"
import { errorCode, isRateLimited } from "@/lib/client/errors"

export function ForgotForm() {
  const t = useTranslations("forgot")
  const tc = useTranslations("common")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { error: err } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/passwort-zuruecksetzen" })
    setBusy(false)
    if (err && isRateLimited(err)) setError(tc("rateLimited"))
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <Alert tone="success">{t("sent")}</Alert>
        <Link href="/login" className={buttonClass("outline", "lg", "w-full")}>
          {tc("toLogin")}
        </Link>
      </div>
    )
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={tc("email")} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        {t("submit")}
      </Button>
      <Link href="/login" className={buttonClass("ghost", "md", "w-full")}>
        {tc("back")}
      </Link>
    </form>
  )
}

export function ResetForm({ token }: { token: string | null }) {
  const t = useTranslations("reset")
  const tr = useTranslations("register")
  const tc = useTranslations("common")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!token) {
    return (
      <div className="space-y-5">
        <Alert tone="error">{t("invalid")}</Alert>
        <Link href="/passwort-vergessen" className={buttonClass("primary", "lg", "w-full")}>
          {t("requestNew")}
        </Link>
      </div>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 10) return setError(tr("errors.passwordShort"))
    if (password !== confirm) return setError(t("mismatch"))
    setBusy(true)
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! })
    setBusy(false)
    if (!err) return window.location.assign("/login?reset=1")
    const code = errorCode(err)
    setError(code === "PASSWORD_COMPROMISED" ? tr("errors.passwordCompromised") : code === "INVALID_TOKEN" ? t("invalid") : isRateLimited(err) ? tc("rateLimited") : tc("genericError"))
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t("newPassword")} htmlFor="new-password" hint={tr("passwordHint")}>
        <PasswordInput id="new-password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label={t("confirm")} htmlFor="confirm-password">
        <PasswordInput id="confirm-password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        {t("submit")}
      </Button>
    </form>
  )
}

export function ResendVerificationForm({ email: initial, callbackURL }: { email: string; callbackURL: string }) {
  const t = useTranslations("verify")
  const tc = useTranslations("common")
  const [email, setEmail] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { error: err } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL })
    setBusy(false)
    if (err && isRateLimited(err)) setError(tc("rateLimited"))
    else setSent(true)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {sent && <Alert tone="success">{t("resent")}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t("resendLabel")} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" className="w-full" size="lg" loading={busy}>
        {t("resend")}
      </Button>
      <Link href="/login" className={buttonClass("ghost", "md", "w-full")}>
        {tc("toLogin")}
      </Link>
    </form>
  )
}
