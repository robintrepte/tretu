import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { Hint } from "@/components/dashboard/panel";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";
import { getSetupStatus } from "@/lib/settings/store";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard");
  if (!hasPermission(userId, "dashboard:view")) redirect("/");

  const canManageSettings = hasPermission(userId, "settings:manage");
  const setup = getSetupStatus();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-muted/50 via-background to-background dark:from-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 space-y-4">
          <DashboardNav
            canCreate={hasPermission(userId, "instances:create")}
            canManageSettings={canManageSettings}
            canManageRoles={hasPermission(userId, "roles:manage")}
          />
          {!setup.ready ? (
            <Hint tone="warning">
              Hetzner ist noch nicht verbunden – Server können erst danach gestartet werden.{" "}
              {canManageSettings ? (
                <Link href="/dashboard/setup" className="font-medium underline underline-offset-2">
                  Zur Einrichtung
                </Link>
              ) : (
                "Ein Admin muss die Einrichtung abschließen."
              )}
            </Hint>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
