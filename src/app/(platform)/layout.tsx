import { getPlatformLocale } from "@/lib/platform/i18n";

import { PlatformI18nProvider } from "./_components/i18n-provider";

/** Tretu platform pages (profile, friends, notifications, wallet, badges, settings). */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const locale = await getPlatformLocale();
  return <PlatformI18nProvider locale={locale}>{children}</PlatformI18nProvider>;
}
