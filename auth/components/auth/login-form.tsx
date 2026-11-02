"use client"

import { Fingerprint, Mail } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { SocialButtons, type ProviderId } from "@/components/auth/social-buttons"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Divider } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { authClient, passkeyOptionsSettled } from "@/lib/client/auth-client"
import { errorCode, isRateLimited } from "@/lib/client/errors"

interface Props {
  providers: ProviderId[]
  steam: boolean
  oauth: { clientName: string; valid: boolean } | null
  signedIn: { name: string } | null
  error?: string
  notice?: "verified" | "reset" | "claimed" | "deleted" | "signedOut"
  next: string
  query: string
}

const PROVIDER_NAMES: Record<string, string> = { discord: "Discord", google: "Google", apple: "Apple", steam: "Steam" }

export function LoginForm({ providers, steam, oauth, signedIn, error: initialError, notice, next, query }: Props) {
  const t = useTranslations("login")
  const tc = useTranslations("common")
  const tl = useTranslations("legacy")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState<"password" | "passkey" | "magic" | "continue" | null>(null)
  const [error, setError] = useState<string | null>(() => describeInitialError(initialError))
  const [magicMode, setMagicMode] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const continued = useRef(false)
  const suffix = query ? `?${query}` : ""
  // Email links (verification, magic link) come back here; inside an app sign-in the flow then continues.
  const returnURL = oauth ? `/login${suffix}` : next

  function describeInitialError(code?: string): string | null {
    if (!code) return null
    if (code === "two_factor_required" || code === "invalid_token" || code === "steam_failed" || code === "state_mismatch" || code === "signup_disabled") return t(`errors.${code}`)
    if (code === "access_denied") return t("errors.cancelled")
    if (code === "account_already_linked_to_different_user" || code === "account_not_linked") return t("errors.account_not_linked")
    if (code === "claim_inUse" || code === "claim_expired") return tl(`errors.${code.slice(6) as "inUse" | "expired"}`)
    if (code.startsWith("claim_")) return tl("errors.oauthFailed")
    if (code.startsWith("provider_")) return t("errors.provider", { provider: PROVIDER_NAMES[code.slice(9)] ?? code.slice(9) })
    return tc("genericError")
  }

  function describe(err: unknown): string {
    if (isRateLimited(err)) return tc("rateLimited")
    switch (errorCode(err)) {
      case "EMAIL_NOT_VERIFIED":
        return t("errors.notVerified")
      case "INVALID_EMAIL_OR_PASSWORD":
      case "INVALID_USERNAME_OR_PASSWORD":
      case "INVALID_PASSWORD":
      case "USER_NOT_FOUND":
      case "CREDENTIAL_ACCOUNT_NOT_FOUND":
        return t("errors.invalid")
      case "ACCOUNT_LOCKED":
      case "TOO_MANY_ATTEMPTS":
        return t("errors.locked")
      case "invalid_signature":
        return t("errors.expired")
      default:
        return tc("genericError")
    }
  }

  async function continueFlow() {
    setBusy("continue")
    const { data, error: err } = await authClient.oauth2.continue({ created: true })
    if (err || !data?.url) {
      setBusy(null)
      setError(err ? describe(err) : tc("genericError"))
    }
  }

  useEffect(() => {
    if (signedIn && !continued.current) {
      continued.current = true
      void continueFlow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on arrival
  }, [])

  // Passkey autofill: browsers offer saved passkeys in the username field.
  useEffect(() => {
    if (signedIn || typeof window === "undefined" || !window.PublicKeyCredential?.isConditionalMediationAvailable) return
    void window.PublicKeyCredential.isConditionalMediationAvailable().then((available) => {
      if (available) void authClient.signIn.passkey({ autoFill: true, fetchOptions: { onSuccess: (ctx) => afterSignIn(ctx.data) } })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, [])

  function afterSignIn(data: unknown) {
    // Inside an app sign-in the response carries the app's redirect, which the client follows itself.
    if ((data as { redirect?: boolean } | null)?.redirect) return
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return
    window.location.assign(next)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy("password")
    const value = identifier.trim()
    const result = value.includes("@")
      ? await authClient.signIn.email({ email: value, password, callbackURL: returnURL })
      : await authClient.signIn.username({ username: value, password })
    if (result.error) {
      setBusy(null)
      setError(describe(result.error))
      return
    }
    afterSignIn(result.data)
  }

  async function onPasskey() {
    setError(null)
    setBusy("passkey")
    await passkeyOptionsSettled()
    const result = await authClient.signIn.passkey()
    if (result?.error) {
      setBusy(null)
      // Cancelling the browser dialog is not an error worth shouting about.
      if (errorCode(result.error) !== "AUTH_CANCELLED") setError(t("errors.passkey"))
      return
    }
    afterSignIn(result?.data)
  }

  async function onMagicLink(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy("magic")
    const { error: err } = await authClient.signIn.magicLink({ email: identifier.trim(), callbackURL: returnURL, errorCallbackURL: `/login${suffix}` })
    setBusy(null)
    if (err && isRateLimited(err)) setError(tc("rateLimited"))
    else setMagicSent(true)
  }

  if (signedIn) {
    return (
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : <Alert>{t("continueTo", { client: oauth?.clientName ?? "" })}</Alert>}
        <Button className="w-full" size="lg" loading={busy === "continue"} onClick={continueFlow}>
          {t("continueAs", { name: signedIn.name })}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await authClient.signOut()
            window.location.reload()
          }}
        >
          {t("otherAccount")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {notice && <Alert tone="success">{t(`notices.${notice}`)}</Alert>}
      {oauth && !oauth.valid && <Alert tone="error">{t("errors.expired")}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {magicMode ? (
        <form onSubmit={onMagicLink} className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("magicLinkText")}</p>
          {magicSent ? (
            <Alert tone="success">{t("magicLinkSent")}</Alert>
          ) : (
            <>
              <Field label={tc("email")} htmlFor="magic-email">
                <Input id="magic-email" type="email" autoComplete="email" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </Field>
              <Button type="submit" className="w-full" size="lg" loading={busy === "magic"}>
                {t("magicLinkSubmit")}
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMagicMode(false)}>
            {tc("back")}
          </Button>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t("identifier")} htmlFor="identifier">
            <Input
              id="identifier"
              name="username"
              autoComplete="username webauthn"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </Field>
          <Field
            label={tc("password")}
            htmlFor="password"
            action={
              <Link href="/passwort-vergessen" className="text-[13px] font-medium text-accent hover:underline">
                {t("forgot")}
              </Link>
            }
          >
            <PasswordInput id="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy === "password"} disabled={busy !== null}>
            {t("submit")}
          </Button>
        </form>
      )}

      {!magicMode && (
        <>
          <Divider label={tc("or")} />
          <div className="grid gap-2.5">
            <Button type="button" variant="outline" size="lg" onClick={onPasskey} loading={busy === "passkey"} disabled={busy !== null}>
              <Fingerprint className="size-5 text-accent" />
              {t("passkey")}
            </Button>
            <SocialButtons providers={providers} steam={steam} callbackURL={next} />
            <Button type="button" variant="ghost" size="lg" onClick={() => setMagicMode(true)} disabled={busy !== null}>
              <Mail className="size-5" />
              {t("magicLink")}
            </Button>
          </div>
        </>
      )}

      <p className="pt-1 text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href={`/registrieren${suffix}` as "/registrieren"} className="font-medium text-accent hover:underline">
          {t("register")}
        </Link>
      </p>
    </div>
  )
}
