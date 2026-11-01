import { log } from "@/lib/observability/logger";
import { getPlatformUser, type PlatformUser } from "@/lib/platform/current-user";
import { isPlatformDbConfigured, platformDb } from "@/lib/platform/db";
import { ensureUser, type DirectoryUser } from "@/lib/platform/directory";
import { getTranslations } from "@/lib/platform/i18n";
import type { PlatformLocale, Translator } from "@/lib/platform/i18n-core";
import { unreadCount } from "@/lib/platform/notifications";

export type PageContext = {
  t: Translator;
  locale: PlatformLocale;
  user: PlatformUser | null;
  directory: DirectoryUser | null;
  unread: number;
  /** False when DATABASE_URL is missing or the database is unreachable. */
  available: boolean;
};

export async function getPageContext(): Promise<PageContext> {
  const { t, locale } = await getTranslations();
  const user = await getPlatformUser();
  const base = { t, locale, user, directory: null, unread: 0 };
  if (!isPlatformDbConfigured()) return { ...base, available: false };
  if (!user) return { ...base, available: true };
  try {
    const directory = await ensureUser(platformDb, user.sub);
    return { ...base, directory, unread: await unreadCount(platformDb, user.sub), available: true };
  } catch (error) {
    log("error", "platform.page.context_failed", { error: error instanceof Error ? error.message : String(error) });
    return { ...base, available: false };
  }
}

/** Runs a page loader; returns null (→ "unavailable" state) when the database fails. */
export async function loadSafely<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    log("error", "platform.page.load_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
