import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { RegisterForm } from "@/components/auth/register-form"
import { enabledSocialProviders, env, steamEnabled, turnstileEnabled } from "@/lib/env"
import { readOAuthRequest, toQueryString, type SearchParams } from "@/lib/oidc/flow"
import { getSession } from "@/lib/session"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("register"))("title") }
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const t = await getTranslations("register")
  const [session, oauth] = await Promise.all([getSession(), readOAuthRequest(params)])
  if (session && !oauth) redirect("/konto")
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <RegisterForm
        query={toQueryString(params)}
        inOAuthFlow={Boolean(oauth?.valid)}
        providers={enabledSocialProviders}
        steam={steamEnabled}
        turnstileSiteKey={turnstileEnabled ? env.TURNSTILE_SITE_KEY! : null}
        legalUrl={env.TRETU_LEGAL_URL}
      />
    </AuthShell>
  )
}
