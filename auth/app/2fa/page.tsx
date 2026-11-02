import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { TwoFactorForm } from "@/components/auth/two-factor-form"
import { readOAuthRequest, toQueryString, type SearchParams } from "@/lib/oidc/flow"
import { authorizeContinuation, safeNext } from "@/lib/redirects"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("twoFactor"))("title") }
}

/**
 * The second factor. Reached after a password sign-in (with the app's signed request in the address) or after a
 * provider/email-link sign-in of a two-factor account (with `next`, see lib/two-factor-challenge.ts).
 */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const oauth = await readOAuthRequest(params)
  // An expired signed request would make the code entry fail: continue through the authorization endpoint instead.
  if (oauth && !oauth.valid) redirect(`/2fa?next=${encodeURIComponent(authorizeContinuation(toQueryString(params)))}` as "/2fa")
  const t = await getTranslations("twoFactor")
  return (
    <AuthShell title={t("title")}>
      <TwoFactorForm next={safeNext(params.next)} />
    </AuthShell>
  )
}
