import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { Alert } from "@/components/ui/alert"
import { buttonClass } from "@/components/ui/button"
import type { SearchParams } from "@/lib/oidc/flow"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("error"))("title") }
}

const KNOWN = new Set([
  "invalid_redirect",
  "invalid_client",
  "client_disabled",
  "access_denied",
  "state_mismatch",
  "account_already_linked_to_different_user",
  "email_doesn't_match",
  "unable_to_link_account",
  "email_not_found",
  "signup_disabled",
  "steam_failed",
  "steam_already_linked",
])

export default async function ErrorPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const t = await getTranslations("error")
  const code = typeof params.error === "string" ? params.error.slice(0, 80) : "unknown"
  const message = KNOWN.has(code) ? t(`codes.${code}` as "codes.default") : t("codes.default")
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <div className="space-y-5">
        <Alert tone="error">{message}</Alert>
        <p className="font-mono text-xs text-muted-foreground">{t("code", { code })}</p>
        <Link href="/login" className={buttonClass("primary", "lg", "w-full")}>
          {t("back")}
        </Link>
      </div>
    </AuthShell>
  )
}
