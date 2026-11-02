"use client"

import { useTranslations } from "next-intl"
import { useState, type FormEvent } from "react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import { authClient } from "@/lib/client/auth-client"
import { errorCode, isRateLimited } from "@/lib/client/errors"

export function TwoFactorForm({ next }: { next: string }) {
  const t = useTranslations("twoFactor")
  const tc = useTranslations("common")
  const tl = useTranslations("login")
  const [mode, setMode] = useState<"totp" | "backup">("totp")
  const [code, setCode] = useState("")
  const [trust, setTrust] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const value = code.replace(/\s/g, "")
    const result =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
        : await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust })
    if (result.error) {
      setBusy(false)
      const c = errorCode(result.error)
      setError(
        isRateLimited(result.error)
          ? tc("rateLimited")
          : c === "ACCOUNT_LOCKED"
            ? tl("errors.accountLocked")
            : c === "INVALID_TWO_FACTOR_COOKIE" || c === "TWO_FACTOR_NOT_ENABLED"
              ? t("expired")
              : c === "TOTP_CODE_REUSED"
                ? t("reused")
                : t("invalid"),
      )
      return
    }
    // Inside an app sign-in the response redirects to the app (client plugin); otherwise on to `next`.
    if (!(result.data as { redirect?: boolean } | null)?.redirect) window.location.assign(next)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-[15px] text-muted-foreground">{mode === "totp" ? t("subtitle") : t("subtitleBackup")}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={mode === "totp" ? t("code") : t("backupCode")} htmlFor="code">
        <Input
          id="code"
          inputMode={mode === "totp" ? "numeric" : "text"}
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={mode === "totp" ? 6 : 24}
          className="text-center font-mono text-lg tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="size-4 accent-[var(--tretu-accent)]" />
        {t("trustDevice")}
      </label>
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        {t("submit")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp")
          setCode("")
          setError(null)
        }}
      >
        {mode === "totp" ? t("useBackup") : t("useTotp")}
      </Button>
    </form>
  )
}
