import { ne } from "drizzle-orm";
import { redirect } from "next/navigation";

import { TeamPanel } from "@/components/dashboard/team-panel";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUserId } from "@/lib/auth/session";
import { getUserRoles, hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export default async function DashboardTeamPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/team");
  if (!hasPermission(userId, "roles:manage")) redirect("/dashboard");

  const members = db
    .select()
    .from(users)
    .where(ne(users.discordId, "system:tretu-dashboard"))
    .orderBy(users.displayName)
    .all()
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      discordId: u.discordId,
      roles: getUserRoles(String(u.id)),
      lastLoginAt: u.updatedAt.toISOString(),
    }));

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Team</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Wer darf was im Dashboard?</p>
      </div>
      <TeamPanel initial={members} currentUserId={Number(userId)} />
    </section>
  );
}
