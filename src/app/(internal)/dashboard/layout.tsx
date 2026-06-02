import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { getUserId } from "@/lib/auth/session";
import { hasPermission, hasRole } from "@/lib/permissions/checks";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard");
  if (!hasPermission(userId, "dashboard:view")) redirect("/");

  const isAdmin = hasRole(userId, "admin");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-muted/50 via-background to-background dark:from-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 space-y-3">
          <DashboardNav isAdmin={isAdmin} />
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Verwaltung eurer Game-Server: Übersicht und neue Instanzen.
            {isAdmin ? <> Als Admin siehst du unter „Aktivität“ laufende Hintergrundjobs.</> : null}
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
