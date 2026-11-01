"use client"

import { BadgeCheck, CircleAlert, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useRef, useState, type FormEvent } from "react"
import { changeUsername, confirmUsername, removeAvatar, uploadAvatar } from "@/app/konto/actions"
import { Avatar } from "@/components/account/avatar"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/field"
import { authClient } from "@/lib/client/auth-client"
import { errorCode, isRateLimited } from "@/lib/client/errors"

interface Props {
  username: string
  name: string
  image: string | null
  email: string | null
  emailVerified: boolean
  usernamePending: boolean
  renameAt: string | null
}

type Status = { tone: "success" | "error"; text: string } | null

export function ProfileSection(props: Props) {
  const t = useTranslations("profile")
  const tc = useTranslations("common")
  const format = useFormatter()
  const router = useRouter()
  const [username, setUsername] = useState(props.username)
  const [name, setName] = useState(props.name)
  const [newEmail, setNewEmail] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, Status>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const show = (key: string, value: Status) => setStatus((s) => ({ ...s, [key]: value }))

  async function onUsername(event: FormEvent) {
    event.preventDefault()
    setBusy("username")
    const result = props.usernamePending ? await confirmUsername(username) : await changeUsername(username)
    setBusy(null)
    if (result.ok) {
      show("username", { tone: "success", text: tc("saved") })
      router.refresh()
    } else if (result.error === "tooSoon") {
      show("username", { tone: "error", text: t("errors.usernameTooSoon", { date: format.dateTime(new Date(result.until!), { dateStyle: "long" }) }) })
    } else {
      show("username", { tone: "error", text: result.error === "taken" ? t("errors.usernameTaken") : t("errors.usernameInvalid") })
    }
  }

  async function onName(event: FormEvent) {
    event.preventDefault()
    const value = name.trim()
    if (!value || value.length > 64) return show("name", { tone: "error", text: t("errors.nameInvalid") })
    setBusy("name")
    const { error } = await authClient.updateUser({ name: value })
    setBusy(null)
    show("name", error ? { tone: "error", text: tc("genericError") } : { tone: "success", text: tc("saved") })
    if (!error) router.refresh()
  }

  async function onAvatar(file: File | undefined) {
    if (!file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      return show("avatar", { tone: "error", text: t("errors.avatarInvalid") })
    }
    setBusy("avatar")
    const form = new FormData()
    form.set("file", file)
    const result = await uploadAvatar(form)
    setBusy(null)
    if (fileInput.current) fileInput.current.value = ""
    show("avatar", result.ok ? { tone: "success", text: tc("saved") } : { tone: "error", text: t("errors.avatarInvalid") })
    if (result.ok) router.refresh()
  }

  async function onEmail(event: FormEvent) {
    event.preventDefault()
    setBusy("email")
    const { error } = await authClient.changeEmail({ newEmail: newEmail.trim(), callbackURL: "/konto?tab=profil" })
    setBusy(null)
    if (!error) {
      setNewEmail("")
      show("email", { tone: "success", text: t("changeEmailSent") })
      router.refresh()
    } else {
      const code = errorCode(error)
      show("email", { tone: "error", text: isRateLimited(error) ? tc("rateLimited") : code === "USER_ALREADY_EXISTS" ? t("errors.emailTaken") : tc("genericError") })
    }
  }

  async function onResend() {
    if (!props.email) return
    setBusy("resend")
    const { error } = await authClient.sendVerificationEmail({ email: props.email, callbackURL: "/konto?tab=profil" })
    setBusy(null)
    show("email", error ? { tone: "error", text: isRateLimited(error) ? tc("rateLimited") : tc("genericError") } : { tone: "success", text: t("changeEmailSent") })
  }

  return (
    <>
      <Card>
        <CardHeader title={t("title")} description={t("description")} />
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={props.name} image={props.image} size={72} />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("avatar")}</p>
              <div className="flex flex-wrap gap-2">
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="avatar-file" onChange={(e) => onAvatar(e.target.files?.[0])} />
                <Button variant="outline" size="sm" loading={busy === "avatar"} onClick={() => fileInput.current?.click()}>
                  <Upload className="size-4" />
                  {t("upload")}
                </Button>
                {props.image && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await removeAvatar()
                      router.refresh()
                    }}
                  >
                    {t("removeAvatar")}
                  </Button>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground">{t("avatarHint")}</p>
            </div>
          </div>
          {status.avatar && <Alert tone={status.avatar.tone}>{status.avatar.text}</Alert>}

          <form onSubmit={onUsername} className="space-y-3" id="username">
            <Field
              label={tc("username")}
              htmlFor="username-input"
              hint={
                <>
                  {t("usernameHint", { username: props.username })}{" "}
                  {props.usernamePending
                    ? t("usernameFree")
                    : props.renameAt
                      ? t("usernameNext", { date: format.dateTime(new Date(props.renameAt), { dateStyle: "long" }) })
                      : null}
                </>
              }
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="username-input" autoCapitalize="none" spellCheck={false} maxLength={24} value={username} onChange={(e) => setUsername(e.target.value)} />
                <Button type="submit" variant="secondary" loading={busy === "username"} disabled={username === props.username && !props.usernamePending}>
                  {tc("save")}
                </Button>
              </div>
            </Field>
            {status.username && <Alert tone={status.username.tone}>{status.username.text}</Alert>}
          </form>

          <form onSubmit={onName} className="space-y-3">
            <Field label={tc("displayName")} htmlFor="display-name" hint={t("displayNameHint")}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="display-name" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
                <Button type="submit" variant="secondary" loading={busy === "name"} disabled={name.trim() === props.name}>
                  {tc("save")}
                </Button>
              </div>
            </Field>
            {status.name && <Alert tone={status.name.tone}>{status.name.text}</Alert>}
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("emailTitle")} />
        <div className="space-y-4">
          {props.email ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-medium">{props.email}</span>
              {props.emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                  <BadgeCheck className="size-3.5" /> {t("verified")}
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                    <CircleAlert className="size-3.5" /> {t("unverified")}
                  </span>
                  <Button variant="ghost" size="sm" loading={busy === "resend"} onClick={onResend}>
                    {t("resendVerification")}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">{t("noEmail")}</p>
          )}
          <form onSubmit={onEmail} className="space-y-3">
            <Field label={t("newEmail")} htmlFor="new-email">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="new-email" type="email" autoComplete="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Button type="submit" variant="secondary" loading={busy === "email"}>
                  {t("changeEmail")}
                </Button>
              </div>
            </Field>
            {status.email && <Alert tone={status.email.tone}>{status.email.text}</Alert>}
          </form>
        </div>
      </Card>
    </>
  )
}
