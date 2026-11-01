import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.notFound");
  return { title: t("title"), description: t("description"), robots: { index: false, follow: true } };
}

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1200px] flex-col items-center justify-center px-4 py-16 text-center">
      <PageTitle title="404" />
      <p className="mt-2 text-muted-foreground">
        {t("message")}
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded px-4 py-2 text-foreground underline hover:text-[var(--tretu-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)]"
      >
        {t("home")}
      </Link>
    </div>
  );
}
