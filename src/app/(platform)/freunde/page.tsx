import { Users } from "lucide-react";
import type { Metadata } from "next";

import { pageMetadata } from "@/lib/metadata";
import { platformDb } from "@/lib/platform/db";
import { listFriends } from "@/lib/platform/friends";
import { getTranslations } from "@/lib/platform/i18n";

import { FriendsClient } from "../_components/friends-client";
import { getPageContext, loadSafely } from "../_components/page-context";
import { LoginRequired, PlatformPage, Unavailable } from "../_components/platform-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return pageMetadata({ title: t("friends.metaTitle"), description: t("friends.intro"), path: "/freunde", noIndex: true });
}

export default async function FriendsPage() {
  const ctx = await getPageContext();
  const { t } = ctx;
  const data = ctx.available && ctx.user ? await loadSafely(() => listFriends(platformDb, ctx.user!.sub)) : null;
  return (
    <PlatformPage ctx={ctx} title={t("friends.title")} icon={Users} intro={t("friends.intro")}>
      {!ctx.available ? (
        <Unavailable ctx={ctx} />
      ) : !ctx.user ? (
        <LoginRequired ctx={ctx} feature={t("nav.friends")} path="/freunde" />
      ) : data ? (
        <FriendsClient initial={data} />
      ) : (
        <Unavailable ctx={ctx} />
      )}
    </PlatformPage>
  );
}
