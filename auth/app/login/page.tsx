import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { LoginForm } from "@/components/auth/login-form"
import { enabledSocialProviders } from "@/lib/env"
import { readOAuthRequest, safeNext, toQueryString, type SearchParams } from "@/lib/oidc/flow"
import { getSession } from "@/lib/session"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("login"))("title") }
}

const NOTICES = ["verified", "reset", "claimed", "deleted", "signedOut"] as const

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const t = await getTranslations("login")
  const [session, oauth] = await Promise.all([getSession(), readOAuthRequest(params)])
  const next = safeNext(params.next)

  // Already signed in and not inside an app sign-in: straight to the account page.
  if (session && !oauth) redirect(next as "/konto")

  const error = typeof params.error === "string" ? params.error : undefined
  const notice = NOTICES.find((n) => params[n] === "1")
  const query = toQueryString(params)
  return (
    <AuthShell title={t("title")} subtitle={oauth ? t("subtitleClient", { client: oauth.clientName }) : t("subtitle")}>
      <LoginForm
        providers={enabledSocialProviders}
        oauth={oauth ? { clientName: oauth.clientName, valid: oauth.valid } : null}
        signedIn={session && oauth && oauth.valid && !oauth.forceLogin ? { name: session.user.name } : null}
        error={error}
        notice={notice}
        next={next}
        query={query}
      />
    </AuthShell>
  )
}
