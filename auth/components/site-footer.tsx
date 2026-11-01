import { getTranslations } from "next-intl/server"
import { LanguageSwitcher } from "@/components/language-switcher"
import { env } from "@/lib/env"

export async function SiteFooter() {
  const t = await getTranslations("common")
  const legal = env.TRETU_LEGAL_URL
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-6 text-[13px] text-muted-foreground">
      <LanguageSwitcher />
      <a href={`${legal}/impressum`} className="hover:text-foreground">
        {t("imprint")}
      </a>
      <a href={`${legal}/datenschutz`} className="hover:text-foreground">
        {t("privacy")}
      </a>
      <a href={`${legal}/agb`} className="hover:text-foreground">
        {t("terms")}
      </a>
    </footer>
  )
}
