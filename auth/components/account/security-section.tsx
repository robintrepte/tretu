"use client"

import { Fingerprint, KeyRound, Laptop, ShieldCheck, Smartphone, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState, type FormEvent } from "react"
import { renderSVG } from "uqr"
import { setFirstPassword, signOutEverywhere } from "@/app/konto/actions"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { authClient } from "@/lib/client/auth-client"
import { errorCode, isRateLimited } from "@/lib/client/errors"
import { describeDevice } from "@/lib/client/user-agent"

interface Props {
  hasPassword: boolean
  /** No real email yet (Steam sign-up, imported account): a first password comes with an email to confirm. */
  needsEmail: boolean
  twoFactorEnabled: boolean
  isAdmin: boolean
  passkeys: { id: string; name: string | null; createdAt: string | null }[]
  currentSessionId: string
  activity: { id: string; event: string; success: boolean; ipAddress: string | null; userAgent: string | null; meta: Record<string, unknown> | null; createdAt: string }[]
}

type Status = { tone: "success" | "error"; text: string } | null

export function SecuritySection(props: Props) {
  return (
    <>
      <PasswordCard hasPassword={props.hasPassword} needsEmail={props.needsEmail} />
      <PasskeysCard passkeys={props.passkeys} />
      <TwoFactorCard enabled={props.twoFactorEnabled} isAdmin={props.isAdmin} hasPassword={props.hasPassword} />
      <SessionsCard currentSessionId={props.currentSessionId} />
      <ActivityCard activity={props.activity} />
    </>
  )
}

function PasswordCard({ hasPassword, needsEmail }: { hasPassword: boolean; needsEmail: boolean }) {
  const t = useTranslations("security")
  const tr = useTranslations("register")
  const tc = useTranslations("common")
  const router = useRouter()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (next.length < 10) return setStatus({ tone: "error", text: tr("errors.passwordShort") })
    setBusy(true)
    if (!hasPassword) {
      const result = await setFirstPassword(next, needsEmail ? email : undefined)
      setBusy(false)
      if (!result.ok) {
        const text = result.error === "compromised" ? tr("errors.passwordCompromised") : result.error === "short" ? tr("errors.passwordShort") : result.error === "email" ? tr("errors.emailInvalid") : tc("genericError")
        return setStatus({ tone: "error", text })
      }
      setNext("")
      setStatus({ tone: "success", text: result.emailSent ? t("passwordSetConfirmEmail", { email: email.trim() }) : tc("saved") })
      return router.refresh()
    }
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true })
    setBusy(false)
    if (error) {
      const code = errorCode(error)
      return setStatus({
        tone: "error",
        text: isRateLimited(error) ? tc("rateLimited") : code === "INVALID_PASSWORD" ? t("wrongPassword") : code === "PASSWORD_COMPROMISED" ? tr("errors.passwordCompromised") : tc("genericError"),
      })
    }
    setCurrent("")
    setNext("")
    setStatus({ tone: "success", text: t("passwordChanged") })
  }

  return (
    <Card>
      <CardHeader title={t("passwordTitle")} description={hasPassword ? t("passwordDescription") : t("passwordNone")} />
      <form onSubmit={onSubmit} className="space-y-4">
        {!hasPassword && needsEmail && (
          <>
            <p className="text-sm text-muted-foreground">{t("passwordNeedsEmail")}</p>
            <Field label={tc("email")} htmlFor="first-password-email">
              <Input id="first-password-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </>
        )}
        {hasPassword && (
          <Field label={t("currentPassword")} htmlFor="current-password">
            <PasswordInput id="current-password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label={t("newPassword")} htmlFor="new-password" hint={tr("passwordHint")}>
          <PasswordInput id="new-password" autoComplete="new-password" required minLength={10} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        <Button type="submit" variant="secondary" loading={busy}>
          <KeyRound className="size-4" />
          {hasPassword ? t("changePassword") : t("setPassword")}
        </Button>
      </form>
    </Card>
  )
}

function PasskeysCard({ passkeys }: { passkeys: Props["passkeys"] }) {
  const t = useTranslations("security")
  const tc = useTranslations("common")
  const format = useFormatter()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(null)

  async function add() {
    setBusy("add")
    setStatus(null)
    const result = await authClient.passkey.addPasskey({ name: `${t("passkeyName")} · ${describeDevice(navigator.userAgent)}` })
    setBusy(null)
    if (result?.error) {
      if (errorCode(result.error) !== "AUTH_CANCELLED") setStatus({ tone: "error", text: t("passkeyFailed") })
      return
    }
    setStatus({ tone: "success", text: t("passkeyAdded") })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader
        title={t("passkeysTitle")}
        description={t("passkeysDescription")}
        action={
          <Button variant="secondary" size="sm" loading={busy === "add"} onClick={add}>
            <Fingerprint className="size-4" />
            {t("addPasskey")}
          </Button>
        }
      />
      {status && <Alert tone={status.tone} className="mb-4">{status.text}</Alert>}
      {passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPasskeys")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Fingerprint className="size-5 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name ?? t("passkeyName")}</div>
                {p.createdAt && <div className="text-sm text-muted-foreground">{t("addedOn", { date: format.dateTime(new Date(p.createdAt), { dateStyle: "medium" }) })}</div>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={tc("remove")}
                loading={busy === p.id}
                onClick={async () => {
                  setBusy(p.id)
                  await authClient.passkey.deletePasskey({ id: p.id })
                  setBusy(null)
                  router.refresh()
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? ""
  } catch {
    return ""
  }
}

function TwoFactorCard({ enabled, isAdmin, hasPassword }: { enabled: boolean; isAdmin: boolean; hasPassword: boolean }) {
  const t = useTranslations("security")
  const tt = useTranslations("twoFactor")
  const tc = useTranslations("common")
  const router = useRouter()
  const [step, setStep] = useState<"idle" | "password" | "scan" | "codes">("idle")
  const [action, setAction] = useState<"enable" | "disable" | "codes">("enable")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [totpURI, setTotpURI] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [copied, setCopied] = useState(false)

  function begin(next: "enable" | "disable" | "codes") {
    setAction(next)
    setStatus(null)
    if (hasPassword) setStep("password")
    else void run(next, undefined)
  }

  async function run(which: "enable" | "disable" | "codes", pw: string | undefined) {
    setBusy(true)
    const passwordArg = pw ? { password: pw } : {}
    if (which === "enable") {
      const { data, error } = await authClient.twoFactor.enable(passwordArg as { password: string })
      setBusy(false)
      if (error || !data || data.method !== "totp") return setStatus({ tone: "error", text: errorCode(error) === "INVALID_PASSWORD" ? t("wrongPassword") : tc("genericError") })
      setTotpURI(data.totpURI)
      setBackupCodes(data.backupCodes)
      setStep("scan")
    } else if (which === "disable") {
      const { error } = await authClient.twoFactor.disable(passwordArg as { password: string })
      setBusy(false)
      if (error) return setStatus({ tone: "error", text: errorCode(error) === "INVALID_PASSWORD" ? t("wrongPassword") : tc("genericError") })
      setStep("idle")
      setStatus({ tone: "success", text: t("twoFactorDisabled") })
      router.refresh()
    } else {
      const { data, error } = await authClient.twoFactor.generateBackupCodes(passwordArg as { password: string })
      setBusy(false)
      if (error || !data) return setStatus({ tone: "error", text: errorCode(error) === "INVALID_PASSWORD" ? t("wrongPassword") : tc("genericError") })
      setBackupCodes(data.backupCodes)
      setStep("codes")
    }
    setPassword("")
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") })
    setBusy(false)
    if (error) return setStatus({ tone: "error", text: isRateLimited(error) ? tc("rateLimited") : errorCode(error) === "TOTP_CODE_REUSED" ? tt("reused") : tt("invalid") })
    setStatus({ tone: "success", text: t("twoFactorEnabled") })
    setStep("codes")
    setCode("")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("twoFactorTitle")}
            <span className={enabled ? "rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success" : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"}>
              {enabled ? t("twoFactorOn") : t("twoFactorOff")}
            </span>
          </span>
        }
        description={
          <>
            {t("twoFactorDescription")} {isAdmin && <strong>{t("twoFactorRequired")}</strong>}
          </>
        }
      />
      <div className="space-y-4">
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        {step === "password" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void run(action, password)
            }}
            className="space-y-3"
          >
            <Field label={t("passwordForAction")} htmlFor="tfa-password">
              <PasswordInput id="tfa-password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                {tc("continue")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
                {tc("cancel")}
              </Button>
            </div>
          </form>
        )}
        {step === "scan" && totpURI && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm">{t("twoFactorScan")}</p>
            <div className="flex flex-wrap items-start gap-5">
              <div className="size-44 rounded-xl bg-white p-2.5 ring-1 ring-border [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: renderSVG(totpURI, { border: 1 }) }} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">{t("twoFactorSecret")}</p>
                <code className="block break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">{secretFromUri(totpURI)}</code>
              </div>
            </div>
            <Field label={tt("code")} htmlFor="tfa-code">
              <Input id="tfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="max-w-40 text-center font-mono tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy}>
              {t("twoFactorVerify")}
            </Button>
          </form>
        )}
        {step === "codes" && backupCodes.length > 0 && (
          <div className="space-y-3 rounded-xl border p-4">
            <p className="font-medium">{t("backupCodesTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("backupCodesText")}</p>
            <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm sm:grid-cols-3">
              {backupCodes.map((c) => (
                <li key={c} className="rounded bg-muted px-2 py-1 text-center">
                  {c}
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(backupCodes.join("\n"))
                setCopied(true)
              }}
            >
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
        )}
        {step === "idle" || step === "codes" ? (
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <Button variant="outline" onClick={() => begin("codes")}>
                  {t("backupCodesRegenerate")}
                </Button>
                {!isAdmin && (
                  <Button variant="ghost" onClick={() => begin("disable")}>
                    {t("twoFactorDisable")}
                  </Button>
                )}
              </>
            ) : (
              <Button onClick={() => begin("enable")} loading={busy}>
                <ShieldCheck className="size-4" />
                {t("twoFactorEnable")}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

interface SessionRow {
  id: string
  token: string
  createdAt: Date | string
  updatedAt: Date | string
  userAgent?: string | null
  ipAddress?: string | null
}

function SessionsCard({ currentSessionId }: { currentSessionId: string }) {
  const t = useTranslations("security")
  const format = useFormatter()
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [version, setVersion] = useState(0)
  const load = () => setVersion((v) => v + 1)
  useEffect(() => {
    let alive = true
    void authClient.listSessions().then(({ data }) => {
      if (alive) setSessions(((data ?? []) as SessionRow[]).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)))
    })
    return () => {
      alive = false
    }
  }, [version])

  return (
    <Card>
      <CardHeader title={t("sessionsTitle")} description={t("sessionsDescription")} />
      <ul className="divide-y rounded-xl border">
        {(sessions ?? []).map((s) => {
          const mobile = /mobile|android|iphone|ipad/i.test(s.userAgent ?? "")
          const Icon = mobile ? Smartphone : Laptop
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Icon className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {s.userAgent ? describeDevice(s.userAgent) : t("unknownDevice")}
                  {s.id === currentSessionId && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{t("thisDevice")}</span>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("lastActive", { date: format.dateTime(new Date(s.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })}
                  {s.ipAddress && ` · ${s.ipAddress}`}
                </div>
              </div>
              {s.id !== currentSessionId && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy === s.id}
                  onClick={async () => {
                    setBusy(s.id)
                    await authClient.revokeSession({ token: s.token })
                    setBusy(null)
                    load()
                  }}
                >
                  {t("revoke")}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-4">
        <p className="text-sm text-muted-foreground">{t("signOutEverywhereText")}</p>
        <Button
          variant="danger"
          size="sm"
          loading={busy === "all"}
          onClick={async () => {
            setBusy("all")
            await signOutEverywhere()
            window.location.assign("/login?signedOut=1")
          }}
        >
          {t("signOutEverywhere")}
        </Button>
      </div>
    </Card>
  )
}

function ActivityCard({ activity }: { activity: Props["activity"] }) {
  const t = useTranslations("security")
  const ta = useTranslations("audit")
  const format = useFormatter()
  return (
    <Card>
      <CardHeader title={t("activityTitle")} description={t("activityDescription")} />
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
      ) : (
        <ol className="space-y-3">
          {activity.map((a) => {
            const method = typeof a.meta?.method === "string" ? a.meta.method : typeof a.meta?.provider === "string" ? a.meta.provider : null
            return (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.success ? "bg-success" : "bg-danger"}`} aria-hidden />
                <div className="min-w-0">
                  <div className="font-medium">
                    {ta.has(a.event.replace(/\./g, "_") as "login") ? ta(a.event.replace(/\./g, "_") as "login") : a.event}
                    {method && <span className="font-normal text-muted-foreground"> · {ta("via", { method: ta.has(`methods.${method}` as "via") ? ta(`methods.${method}` as "via") : method })}</span>}
                    {!a.success && <span className="font-normal text-danger"> · {t("failed")}</span>}
                  </div>
                  <div className="text-muted-foreground">
                    {format.dateTime(new Date(a.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    {a.userAgent && ` · ${describeDevice(a.userAgent)}`}
                    {a.ipAddress && ` · ${a.ipAddress}`}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
