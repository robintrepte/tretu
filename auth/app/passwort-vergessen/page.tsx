import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { ForgotForm } from "@/components/auth/simple-forms"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("forgot"))("title") }
}

export default async function ForgotPage() {
  const t = await getTranslations("forgot")
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <ForgotForm />
    </AuthShell>
  )
}
