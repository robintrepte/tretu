import { Bell } from "lucide-react";
import type { Metadata } from "next";

import { pageMetadata } from "@/lib/metadata";
import { platformDb } from "@/lib/platform/db";
import { getWebPushConfig } from "@/lib/platform/env";
import { getTranslations } from "@/lib/platform/i18n";
import { listNotifications } from "@/lib/platform/notifications";

import { NotificationsClient } from "../_components/notifications-client";
import { getPageContext, loadSafely } from "../_components/page-context";
import { LoginRequired, PlatformPage, Unavailable } from "../_components/platform-page";
import { PushToggle } from "../_components/push-toggle";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return pageMetadata({ title: t("notifications.metaTitle"), description: t("notifications.empty"), path: "/benachrichtigungen", noIndex: true });
}

export default async function NotificationsPage() {
  const ctx = await getPageContext();
  const { t } = ctx;
  const items = ctx.available && ctx.user ? await loadSafely(() => listNotifications(platformDb, ctx.user!.sub, { limit: 30 })) : null;
  return (
    <PlatformPage ctx={ctx} title={t("notifications.title")} icon={Bell}>
      {!ctx.available ? (
        <Unavailable ctx={ctx} />
      ) : !ctx.user ? (
        <LoginRequired ctx={ctx} feature={t("nav.notifications")} path="/benachrichtigungen" />
      ) : items ? (
        <div className="space-y-6">
          <NotificationsClient initial={items} initialUnread={ctx.unread} />
          <PushToggle configured={Boolean(getWebPushConfig())} />
        </div>
      ) : (
        <Unavailable ctx={ctx} />
      )}
    </PlatformPage>
  );
}
