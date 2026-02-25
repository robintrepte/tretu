import type { Metadata } from "next";
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  LOCALE,
  DEFAULT_DESCRIPTION,
} from "@/lib/seo";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
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
      locale: LOCALE,
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
