import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { TwoFactorForm } from "@/components/auth/two-factor-form"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("twoFactor"))("title") }
}

export default async function TwoFactorPage() {
  const t = await getTranslations("twoFactor")
  return (
    <AuthShell title={t("title")}>
      <TwoFactorForm />
    </AuthShell>
  )
}
