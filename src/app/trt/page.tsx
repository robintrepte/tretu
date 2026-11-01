import type { Metadata } from "next";

import { TrtAvatarGenerator } from "@/components/trt-avatar-generator";
import { translatedMetadata } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("trt", "/trt", { keywords: ["TRT", "Clan", "Avatar", "Generator", "Tretu", "Profilbild"] });
}

export default async function TrtAvatarPage() {
  const t = await getTranslations("trt");
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <div className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("intro")}</p>
      </div>
      <TrtAvatarGenerator />
    </div>
  );
}
