import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { InstanceGrid } from "@/components/dashboard/instance-grid";
import { Button } from "@/components/ui/button";
import { getUserId } from "@/lib/auth/session";
import { listInstanceSummaries } from "@/lib/dashboard/view";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard");
  const instances = await listInstanceSummaries();
  const canCreate = hasPermission(userId, "instances:create");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Game-Server</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Server laufen nur, wenn ihr spielt. Ausgeschaltete Server behalten Welt und Einstellungen und kosten nur den
            Speicher.
          </p>
        </div>
        {canCreate && instances.length ? (
          <Button asChild className="rounded-xl bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
            <Link href="/dashboard/new">
              <Plus /> Neuer Server
            </Link>
          </Button>
        ) : null}
      </div>

      {instances.length === 0 ? (
        <DashboardEmptyState canCreate={canCreate} />
      ) : (
        <InstanceGrid
          initial={instances}
          canStart={hasPermission(userId, "instances:start")}
          canStop={hasPermission(userId, "instances:stop")}
        />
      )}
    </section>
  );
}
