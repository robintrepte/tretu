import { isNull, ne, or } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { SYSTEM_DISCORD_ID } from "@/lib/orchestrator/jobs";
import { getRolesForUsers } from "@/lib/permissions/checks";
import type { Role } from "@/lib/permissions/types";

export type TeamMember = {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  discordId: string | null;
  roles: Role[];
  lastLoginAt: string;
};

/** Everyone who ever signed in (without the internal "Automatik" user), with their roles. */
export async function listTeamMembers(): Promise<TeamMember[]> {
  const rows = await db
    .select()
    .from(users)
    .where(or(isNull(users.discordId), ne(users.discordId, SYSTEM_DISCORD_ID)))
    .orderBy(users.displayName);
  const roles = await getRolesForUsers(rows.map((u) => u.id));
  return rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    discordId: u.discordId,
    roles: roles.get(u.id) ?? [],
    lastLoginAt: u.updatedAt.toISOString(),
  }));
}
