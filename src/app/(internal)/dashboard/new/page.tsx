import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CreateServerWizard } from "@/components/dashboard/create-server-wizard";
import { Hint } from "@/components/dashboard/panel";
import { getUserId } from "@/lib/auth/session";
import { getPermissions } from "@/lib/permissions/checks";
import { getCloudflareConfig, getSetupStatus } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function DashboardNewInstancePage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/new");
  const permissions = await getPermissions(userId);
  if (!permissions.includes("instances:create")) redirect("/dashboard");

  const [setup, cf, t] = await Promise.all([getSetupStatus(), getCloudflareConfig(), getTranslations("dashboard.create")]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
      </div>
      {!setup.ready ? (
        <Hint tone="warning">
          {t("hetznerMissing")}{" "}
          {permissions.includes("settings:manage") ? (
            <Link href="/dashboard/setup" className="font-medium underline">
              {t("setupNow")}
            </Link>
          ) : (
            t("askAdmin")
          )}
        </Hint>
      ) : (
        <CreateServerWizard
          cloudflareDomain={setup.cloudflare ? (cf?.domain ?? null) : null}
          curseforgeAvailable={setup.curseforge}
        />
      )}
    </section>
  );
}
