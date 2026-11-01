"use client"

import { MailCheck } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useCallback, useState, type FormEvent } from "react"
import { SocialButtons, type ProviderId } from "@/components/auth/social-buttons"
import { Turnstile } from "@/components/auth/turnstile"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Divider } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { authClient } from "@/lib/client/auth-client"
import { errorCode, isRateLimited } from "@/lib/client/errors"

const USERNAME = /^[A-Za-z0-9_-]{3,24}$/

export function RegisterForm({
  query,
  inOAuthFlow,
  providers,
  turnstileSiteKey,
  legalUrl,
}: {
  query: string
  inOAuthFlow: boolean
  providers: ProviderId[]
  turnstileSiteKey: string | null
  legalUrl: string
}) {
  const t = useTranslations("register")
  const tc = useTranslations("common")
  const locale = useLocale()
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; password?: string; email?: string; form?: string }>({})
  const [done, setDone] = useState(false)
  const suffix = query ? `?${query}` : ""
  const onToken = useCallback((token: string | null) => setCaptcha(token), [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    if (!USERNAME.test(username.trim())) next.username = t("errors.usernameInvalid")
    if (password.length < 10) next.password = t("errors.passwordShort")
    if (turnstileSiteKey && !captcha) next.form = t("errors.captcha")
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    const { error } = await authClient.signUp.email({
      email: email.trim(),
      password,
      name: name.trim() || username.trim(),
      username: username.trim(),
      // The confirmation link signs the user in; inside an app sign-in it then continues to the app.
      callbackURL: inOAuthFlow ? `/login${suffix}${suffix ? "&" : "?"}verified=1` : "/konto?verified=1",
      fetchOptions: captcha ? { headers: { "x-captcha-response": captcha } } : undefined,
    })
    setBusy(false)
    if (!error) {
      setDone(true)
      return
    }
    const code = errorCode(error)
    if (isRateLimited(error)) setErrors({ form: tc("rateLimited") })
    else if (code === "USERNAME_IS_ALREADY_TAKEN") setErrors({ username: t("errors.usernameTaken") })
    else if (code === "INVALID_USERNAME" || code === "USERNAME_TOO_SHORT" || code === "USERNAME_TOO_LONG") setErrors({ username: t("errors.usernameInvalid") })
    else if (code === "PASSWORD_COMPROMISED") setErrors({ password: t("errors.passwordCompromised") })
    else if (code === "PASSWORD_TOO_SHORT") setErrors({ password: t("errors.passwordShort") })
    else if (code === "INVALID_EMAIL") setErrors({ email: t("errors.emailInvalid") })
    else if (code === "VERIFICATION_FAILED" || code === "MISSING_RESPONSE") setErrors({ form: t("errors.captcha") })
    // An existing email is not revealed: the owner gets an email instead (Better Auth), we show "check inbox".
    else if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") setDone(true)
    else setErrors({ form: tc("genericError") })
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <MailCheck className="size-7" />
        </div>
        <h2 className="text-lg font-semibold">{t("doneTitle")}</h2>
        <p className="text-[15px] text-muted-foreground">{t("doneText", { email: email.trim() })}</p>
        <p className="text-sm text-muted-foreground">{t("doneHint")}</p>
        <Link href={`/email-bestaetigen?email=${encodeURIComponent(email.trim())}${query ? `&${query}` : ""}` as "/email-bestaetigen"} className="text-sm font-medium text-accent hover:underline">
          {tc("continue")}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={tc("username")} htmlFor="username" hint={t("usernameHint")} error={errors.username}>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={24}
            value={username}
            aria-invalid={Boolean(errors.username)}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label={tc("displayName")} htmlFor="name" hint={t("displayNameHint")}>
          <Input id="name" autoComplete="nickname" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={tc("email")} htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" required value={email} aria-invalid={Boolean(errors.email)} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={tc("password")} htmlFor="new-password" hint={t("passwordHint")} error={errors.password}>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            value={password}
            aria-invalid={Boolean(errors.password)}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={onToken} language={locale} />}
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t.rich("legal", {
            terms: (chunks) => (
              <a href={`${legalUrl}/agb`} className="underline hover:text-foreground" target="_blank" rel="noreferrer">
                {chunks}
              </a>
            ),
            privacy: (chunks) => (
              <a href={`${legalUrl}/datenschutz`} className="underline hover:text-foreground" target="_blank" rel="noreferrer">
                {chunks}
              </a>
            ),
          })}
        </p>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t("submit")}
        </Button>
      </form>
      {providers.length > 0 && (
        <>
          <Divider label={tc("or")} />
          <SocialButtons providers={providers} callbackURL="/konto" />
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href={`/login${suffix}` as "/login"} className="font-medium text-accent hover:underline">
          {t("login")}
        </Link>
      </p>
    </div>
  )
}
