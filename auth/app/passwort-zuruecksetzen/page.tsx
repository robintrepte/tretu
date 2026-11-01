import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { ResetForm } from "@/components/auth/simple-forms"
import type { SearchParams } from "@/lib/oidc/flow"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reset"))("title") }
}

export default async function ResetPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const t = await getTranslations("reset")
  const token = typeof params.token === "string" ? params.token : null
  const invalid = params.error === "INVALID_TOKEN" || !token
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <ResetForm token={invalid ? null : token} />
    </AuthShell>
  )
}
