import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ImpressumDe } from "@/components/legal/impressum-de";
import { ImpressumEn } from "@/components/legal/impressum-en";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_UPDATED } from "@/components/legal/operator";
import { translatedMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("impressum", "/impressum", { keywords: ["Impressum", "Tretu", "FollowerX", "Kontakt"] });
}

export default async function ImpressumPage() {
  const isDe = (await getLocale()) !== "en";
  const t = await getTranslations("legal");
  const tMeta = await getTranslations("meta.impressum");
  return (
    <LegalPage
      title={tMeta("title")}
      icon="impressum"
      path="/impressum"
      description={tMeta("description")}
      updated={t("updated", { date: isDe ? LEGAL_UPDATED.de : LEGAL_UPDATED.en })}
      notice={isDe ? undefined : t("translationNotice")}
      lang={isDe ? "de" : "en"}
    >
      {isDe ? <ImpressumDe /> : <ImpressumEn />}
    </LegalPage>
  );
}
