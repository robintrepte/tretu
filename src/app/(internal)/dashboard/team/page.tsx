import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { TeamPanel } from "@/components/dashboard/team-panel";
import { getUserId } from "@/lib/auth/session";
import { listTeamMembers } from "@/lib/dashboard/team";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export default async function DashboardTeamPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/team");
  if (!(await hasPermission(userId, "roles:manage"))) redirect("/dashboard");

  const [members, t] = await Promise.all([listTeamMembers(), getTranslations("dashboard.team")]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
      </div>
      <TeamPanel initial={members} currentUserId={Number(userId)} />
    </section>
  );
}
