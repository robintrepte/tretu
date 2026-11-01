"use client"

import { Download, TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, type FormEvent } from "react"
import { deleteAccount } from "@/app/konto/actions"
import { Alert } from "@/components/ui/alert"
import { Button, buttonClass } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"

export function PrivacySection({ username, hasPassword }: { username: string; hasPassword: boolean }) {
  const t = useTranslations("privacy")
  const tc = useTranslations("common")
  const [confirm, setConfirm] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDelete(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await deleteAccount({ confirm, password: hasPassword ? password : undefined })
    if (result.ok) return window.location.assign("/login?deleted=1")
    setBusy(false)
    setError(result.error === "mismatch" ? t("deleteMismatch") : result.error === "reauth" ? t("deleteReauth") : t("wrongPassword"))
  }

  return (
    <>
      <Card>
        <CardHeader title={t("exportTitle")} description={t("exportText")} />
        <a href="/api/account/export" className={buttonClass("secondary")} download>
          <Download className="size-4" />
          {t("exportButton")}
        </a>
      </Card>
      <Card className="border-danger/30">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2 text-danger">
              <TriangleAlert className="size-5" />
              {t("deleteTitle")}
            </span>
          }
          description={t("deleteText")}
        />
        <form onSubmit={onDelete} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label={t("deleteConfirmLabel", { username })} htmlFor="delete-confirm">
            <Input id="delete-confirm" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {hasPassword && (
            <Field label={tc("password")} htmlFor="delete-password">
              <PasswordInput id="delete-password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          <Button type="submit" variant="danger" loading={busy} disabled={confirm.trim().toLowerCase() !== username.toLowerCase()}>
            {t("deleteButton")}
          </Button>
        </form>
      </Card>
    </>
  )
}
