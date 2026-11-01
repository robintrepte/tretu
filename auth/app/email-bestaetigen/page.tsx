import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { ResendVerificationForm } from "@/components/auth/simple-forms"
import { toQueryString, type SearchParams } from "@/lib/oidc/flow"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("verify"))("title") }
}

export default async function VerifyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const t = await getTranslations("verify")
  const { email, ...rest } = params
  const query = toQueryString(rest)
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <ResendVerificationForm email={typeof email === "string" ? email : ""} callbackURL={query ? `/login?${query}&verified=1` : "/konto?verified=1"} />
    </AuthShell>
  )
}
