import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AGB_TOC_DE, AgbDe } from "@/components/legal/agb-de";
import { AGB_TOC_EN, AgbEn } from "@/components/legal/agb-en";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_UPDATED } from "@/components/legal/operator";
import { translatedMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("agb", "/agb", { keywords: ["AGB", "Nutzungsbedingungen", "Tretu-Credits", "Widerruf", "Tretu"] });
}

export default async function AgbPage() {
  const isDe = (await getLocale()) !== "en";
  const t = await getTranslations("legal");
  const tMeta = await getTranslations("meta.agb");
  return (
    <LegalPage
      title={tMeta("title")}
      icon="agb"
      path="/agb"
      description={tMeta("description")}
      updated={t("updated", { date: isDe ? LEGAL_UPDATED.de : LEGAL_UPDATED.en })}
      notice={isDe ? undefined : t("translationNotice")}
      toc={isDe ? AGB_TOC_DE : AGB_TOC_EN}
      tocTitle={t("toc")}
      lang={isDe ? "de" : "en"}
    >
      {isDe ? <AgbDe /> : <AgbEn />}
    </LegalPage>
  );
}
