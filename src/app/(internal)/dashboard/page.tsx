import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { InstanceGrid } from "@/components/dashboard/instance-grid";
import { Button } from "@/components/ui/button";
import { getUserId } from "@/lib/auth/session";
import { listInstanceSummaries } from "@/lib/dashboard/view";
import { getPermissions } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard");
  const [instances, permissions, t] = await Promise.all([
    listInstanceSummaries(),
    getPermissions(userId),
    getTranslations("dashboard.home"),
  ]);
  const canCreate = permissions.includes("instances:create");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
        </div>
        {canCreate && instances.length ? (
          <Button asChild className="rounded-xl bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
            <Link href="/dashboard/new">
              <Plus /> {t("new")}
            </Link>
          </Button>
        ) : null}
      </div>

      {instances.length === 0 ? (
        <DashboardEmptyState canCreate={canCreate} />
      ) : (
        <InstanceGrid
          initial={instances}
          canStart={permissions.includes("instances:start")}
          canStop={permissions.includes("instances:stop")}
        />
      )}
    </section>
  );
}
