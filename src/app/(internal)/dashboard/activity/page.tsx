import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { ActivityList } from "@/components/dashboard/activity-list";
import { db } from "@/db";
import { actionJobs } from "@/db/schema";
import { getUserId } from "@/lib/auth/session";
import { hasRole } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export default async function DashboardActivityPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/activity");
  if (!hasRole(userId, "admin")) redirect("/dashboard");

  const jobs = db.select().from(actionJobs).orderBy(desc(actionJobs.createdAt)).limit(50).all();

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm backdrop-blur-sm dark:bg-card/30 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Aktivität</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Was zuletzt angestoßen wurde (zum Beispiel Einrichtung, Start, Backup). Einträge werden nacheinander abgearbeitet.
          „Fehlgeschlagen“ bedeutet, dass etwas schiefgelaufen ist.
        </p>
      </div>
      <div>
        <ActivityList
          items={jobs.map((job) => ({
            id: job.id,
            createdAt: job.createdAt.toISOString(),
            message: `${job.actionType} (instance #${job.instanceId})`,
            status: job.status as "queued" | "running" | "failed" | "succeeded",
          }))}
        />
      </div>
    </section>
  );
}
