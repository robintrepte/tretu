import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { ConsentForm } from "@/components/auth/flow-forms"
import { readOAuthRequest, toQueryString, type SearchParams } from "@/lib/oidc/flow"
import { getSession } from "@/lib/session"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("consent"))("title") }
}

/** Consent for clients that are not first-party (every Tretu app skips this page). */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const t = await getTranslations("consent")
  const [session, oauth] = await Promise.all([getSession(), readOAuthRequest(params)])
  if (!session) redirect(`/login?${toQueryString(params)}` as "/login")
  if (!oauth?.valid) redirect("/fehler?error=invalid_request" as "/fehler")
  const scopes = (typeof params.scope === "string" ? params.scope : "").split(" ").filter(Boolean)
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle", { client: oauth.clientName })}>
      <ConsentForm clientName={oauth.clientName} scopes={scopes} userName={session.user.name} />
    </AuthShell>
  )
}
