import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { resolveLocale, type Locale } from "@/i18n/config";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE } from "@/lib/seo";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
  locale?: Locale;
  openGraph?: Partial<Metadata["openGraph"]>;
};

/**
 * Generates full metadata for a page: title, description, canonical, OG, Twitter, robots.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords,
  noIndex = false,
  locale = "de",
  openGraph = {},
}: PageMetadataOptions): Metadata {
  const canonical = path.startsWith("/") ? path : `/${path}`;
  const url = `${SITE_URL}${canonical}`;

  return {
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      locale: OG_LOCALE[locale],
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: DEFAULT_OG_IMAGE, width: 512, height: 512, alt: `${SITE_NAME} – ${title}` }],
      ...openGraph,
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    ...(noIndex
      ? { robots: { index: false, follow: true } }
      : { robots: { index: true, follow: true } }),
  };
}

/** `pageMetadata` with title and description from the `meta.<key>` messages of the current language. */
export async function translatedMetadata(
  key: string,
  path: string,
  options: { keywords?: string[]; noIndex?: boolean } = {}
): Promise<Metadata> {
  const t = await getTranslations("meta");
  const locale = resolveLocale(await getLocale());
  return pageMetadata({
    title: t(`${key}.title`),
    description: t(`${key}.description`),
    path,
    locale,
    ...options,
  });
}
