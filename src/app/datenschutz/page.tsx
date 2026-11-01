import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { DATENSCHUTZ_TOC_DE, DatenschutzDe } from "@/components/legal/datenschutz-de";
import { DATENSCHUTZ_TOC_EN, DatenschutzEn } from "@/components/legal/datenschutz-en";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_UPDATED } from "@/components/legal/operator";
import { translatedMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("datenschutz", "/datenschutz", {
    keywords: ["Datenschutz", "Datenschutzerklärung", "DSGVO", "Tretu", "Privacy"],
  });
}

export default async function DatenschutzPage() {
  const isDe = (await getLocale()) !== "en";
  const t = await getTranslations("legal");
  const tMeta = await getTranslations("meta.datenschutz");
  return (
    <LegalPage
      title={tMeta("title")}
      icon="datenschutz"
      path="/datenschutz"
      description={tMeta("description")}
      updated={t("updated", { date: isDe ? LEGAL_UPDATED.de : LEGAL_UPDATED.en })}
      notice={isDe ? undefined : t("translationNotice")}
      toc={isDe ? DATENSCHUTZ_TOC_DE : DATENSCHUTZ_TOC_EN}
      tocTitle={t("toc")}
      lang={isDe ? "de" : "en"}
    >
      {isDe ? <DatenschutzDe /> : <DatenschutzEn />}
    </LegalPage>
  );
}
