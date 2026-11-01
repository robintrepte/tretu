import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { Hint } from "@/components/dashboard/panel";
import { getUserId } from "@/lib/auth/session";
import { getPermissions } from "@/lib/permissions/checks";
import { getSetupStatus } from "@/lib/settings/store";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard");
  const permissions = await getPermissions(userId);
  if (!permissions.includes("dashboard:view")) redirect("/");

  const t = await getTranslations("dashboard.layout");
  const canManageSettings = permissions.includes("settings:manage");
  const setup = await getSetupStatus();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-muted/50 via-background to-background dark:from-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 space-y-4">
          <DashboardNav
            canCreate={permissions.includes("instances:create")}
            canManageSettings={canManageSettings}
            canManageRoles={permissions.includes("roles:manage")}
          />
          {!setup.ready ? (
            <Hint tone="warning">
              {t("hetznerMissing")}{" "}
              {canManageSettings ? (
                <Link href="/dashboard/setup" className="font-medium underline underline-offset-2">
                  {t("toSetup")}
                </Link>
              ) : (
                t("askAdmin")
              )}
            </Hint>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
