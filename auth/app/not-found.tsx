import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { buttonClass } from "@/components/ui/button"

export default async function NotFound() {
  const t = await getTranslations("error")
  return (
    <AuthShell title="404" subtitle={t("codes.default")}>
      <Link href="/login" className={buttonClass("primary", "lg", "w-full")}>
        {t("back")}
      </Link>
    </AuthShell>
  )
}
