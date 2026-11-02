import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveLocale } from "@/i18n/config";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { HomePageBodyClass } from "@/components/home-page-body-class";
import { HomeShaderFallback } from "@/components/home-shader-fallback";
import {
  SITE_URL,
  SITE_NAME,
  SITE_NAME_FULL,
  DEFAULT_OG_IMAGE,
  OG_LOCALE,
  SOCIAL_LINKS,
  DEFAULT_KEYWORDS,
} from "@/lib/seo";
import "./globals.css";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const locale = resolveLocale(await getLocale());
  const description = t("defaultDescription");
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: SITE_NAME_FULL,
      template: `%s | ${SITE_NAME}`,
    },
    description,
    keywords: DEFAULT_KEYWORDS,
    authors: [{ name: SITE_NAME_FULL, url: SITE_URL }],
    creator: SITE_NAME_FULL,
    publisher: SITE_NAME_FULL,
    formatDetection: { email: false, address: false, telephone: false },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: SITE_URL,
      siteName: SITE_NAME,
      title: SITE_NAME_FULL,
      description,
      images: [{ url: DEFAULT_OG_IMAGE, width: 512, height: 512, alt: `${SITE_NAME} Logo` }],
    },
    twitter: {
      card: "summary",
      title: SITE_NAME_FULL,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    alternates: { canonical: "/" },
    icons: { icon: "/logo.svg", apple: "/logo.svg" },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    verification: {},
    manifest: "/manifest.webmanifest",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = resolveLocale(await getLocale());
  const t = await getTranslations("meta");
  return (
    <html lang={locale} className={jost.variable} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <HomeShaderFallback />
        <div id="home-shader-portal" className="fixed inset-0 -z-10 pointer-events-none" aria-hidden />
        <NextIntlClientProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <HomePageBodyClass />
            <Header />
            <main className="flex-1" id="main-content" aria-label={t("mainContent")}>
              {children}
            </main>
            <Footer />
            <Toaster richColors />
          </ThemeProvider>
        </NextIntlClientProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  url: `${SITE_URL}/`,
                  name: SITE_NAME,
                  description: t("defaultDescription"),
                  inLanguage: locale,
                  publisher: { "@id": `${SITE_URL}/#organization` },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: { "@type": "EntryPoint", url: `${SITE_URL}/` },
                    "query-input": "required name=q",
                  },
                },
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: SITE_NAME_FULL,
                  url: `${SITE_URL}/`,
                  logo: {
                    "@type": "ImageObject",
                    url: `${SITE_URL}/logo.svg`,
                  },
                  sameAs: [...SOCIAL_LINKS],
                },
              ],
            }),
          }}
        />
      </body>
    </html>
  );
}
