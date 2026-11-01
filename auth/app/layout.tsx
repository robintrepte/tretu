import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { headers } from "next/headers"
import Script from "next/script"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { assertProductionEnv, issuer } from "@/lib/env"
import "./globals.css"

assertProductionEnv()

const jost = localFont({
  src: [
    { path: "./fonts/jost-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/jost-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-jost",
  display: "swap",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common")
  return {
    metadataBase: new URL(issuer),
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    description: t("tagline"),
    robots: { index: false, follow: false },
    icons: { icon: "/favicon.ico" },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#171513" },
  ],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const nonce = (await headers()).get("x-nonce") ?? undefined
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  return (
    <html lang={locale} className={jost.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {umamiSrc && umamiId && <Script src={umamiSrc} data-website-id={umamiId} strategy="afterInteractive" nonce={nonce} />}
      </body>
    </html>
  )
}
