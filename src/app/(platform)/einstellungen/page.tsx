import { ExternalLink, Settings } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/metadata";
import { platformDb } from "@/lib/platform/db";
import { accountUrl } from "@/lib/platform/format";
import { getTranslations } from "@/lib/platform/i18n";
import { getNotificationSettings } from "@/lib/platform/notifications";
import { getVisibility } from "@/lib/platform/profile";
import { getTsLinkState, teamspeakConfigured } from "@/lib/platform/teamspeak";

import { getPageContext, loadSafely } from "../_components/page-context";
import { LoginRequired, PlatformPage, Unavailable } from "../_components/platform-page";
import { SettingsClient, TeamspeakLink } from "../_components/settings-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return pageMetadata({ title: t("settings.metaTitle"), description: t("settings.intro"), path: "/einstellungen", noIndex: true });
}

export default async function SettingsPage() {
  const ctx = await getPageContext();
  const { t } = ctx;
  const tsEnabled = teamspeakConfigured();
  const data =
    ctx.available && ctx.user
      ? await loadSafely(async () => ({
          visibility: await getVisibility(platformDb, ctx.user!.sub),
          notifications: await getNotificationSettings(platformDb, ctx.user!.sub),
          teamspeak: tsEnabled ? await getTsLinkState(platformDb, ctx.user!.sub) : null,
        }))
      : null;
  return (
    <PlatformPage ctx={ctx} title={t("settings.title")} icon={Settings} intro={t("settings.intro")}>
      {!ctx.available ? (
        <Unavailable ctx={ctx} />
      ) : !ctx.user ? (
        <LoginRequired ctx={ctx} feature={t("nav.settings")} path="/einstellungen" />
      ) : !data ? (
        <Unavailable ctx={ctx} />
      ) : (
        <div className="space-y-6">
          <SettingsClient initialVisibility={data.visibility} initialNotifications={data.notifications} />
          {data.teamspeak ? <TeamspeakLink initial={data.teamspeak} /> : null}
          <Button asChild variant="outline">
            <a href={accountUrl()} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t("settings.accountLink")}
            </a>
          </Button>
        </div>
      )}
    </PlatformPage>
  );
}
