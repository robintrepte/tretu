import { desc, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { ActivityList } from "@/components/dashboard/activity-list";
import { db } from "@/db";
import { actionJobs, gameInstances, users } from "@/db/schema";
import { getUserId } from "@/lib/auth/session";
import { ACTION_LABELS } from "@/lib/orchestrator/action-types";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export default async function DashboardActivityPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/activity");
  if (!hasPermission(userId, "roles:manage")) redirect("/dashboard");

  const jobs = db.select().from(actionJobs).orderBy(desc(actionJobs.createdAt)).limit(100).all();
  const instanceIds = [...new Set(jobs.map((j) => j.instanceId))];
  const userIds = [...new Set(jobs.map((j) => j.requestedByUserId))];
  const names = new Map(
    instanceIds.length
      ? db
          .select({ id: gameInstances.id, name: gameInstances.name })
          .from(gameInstances)
          .where(inArray(gameInstances.id, instanceIds))
          .all()
          .map((i) => [i.id, i.name])
      : []
  );
  const people = new Map(
    userIds.length
      ? db
          .select({ id: users.id, name: users.displayName })
          .from(users)
          .where(inArray(users.id, userIds))
          .all()
          .map((u) => [u.id, u.name])
      : []
  );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Aktivität</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Alle Aktionen über alle Server – inklusive automatischer Abschaltungen.
        </p>
      </div>
      <ActivityList
        items={jobs.map((job) => ({
          id: job.id,
          instanceId: job.instanceId,
          createdAt: job.createdAt.toISOString(),
          title: `${ACTION_LABELS[job.actionType] ?? job.actionType} · ${names.get(job.instanceId) ?? `#${job.instanceId}`}`,
          subtitle: [people.get(job.requestedByUserId), job.error].filter(Boolean).join(" · "),
          status: job.status,
        }))}
      />
    </section>
  );
}
