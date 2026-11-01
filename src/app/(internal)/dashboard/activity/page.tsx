import { desc, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ActivityList } from "@/components/dashboard/activity-list";
import { db } from "@/db";
import { actionJobs, gameInstances, users } from "@/db/schema";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export default async function DashboardActivityPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/activity");
  if (!(await hasPermission(userId, "roles:manage"))) redirect("/dashboard");

  const t = await getTranslations("dashboard");
  const jobs = await db.select().from(actionJobs).orderBy(desc(actionJobs.createdAt), desc(actionJobs.id)).limit(100);
  const instanceIds = [...new Set(jobs.map((j) => j.instanceId))];
  const userIds = [...new Set(jobs.map((j) => j.requestedByUserId))];
  const [instanceRows, userRows] = await Promise.all([
    instanceIds.length
      ? db
          .select({ id: gameInstances.id, name: gameInstances.name })
          .from(gameInstances)
          .where(inArray(gameInstances.id, instanceIds))
      : Promise.resolve([]),
    userIds.length
      ? db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);
  const names = new Map(instanceRows.map((i) => [i.id, i.name]));
  const people = new Map(userRows.map((u) => [u.id, u.name]));
  const actionLabel = (type: string) => (t.has(`actions.${type}`) ? t(`actions.${type}`) : type);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("activity.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("activity.intro")}</p>
      </div>
      <ActivityList
        items={jobs.map((job) => ({
          id: job.id,
          instanceId: job.instanceId,
          createdAt: job.createdAt.toISOString(),
          title: `${actionLabel(job.actionType)} · ${names.get(job.instanceId) ?? `#${job.instanceId}`}`,
          subtitle: [people.get(job.requestedByUserId), job.error].filter(Boolean).join(" · "),
          status: job.status,
        }))}
      />
    </section>
  );
}
