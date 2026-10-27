import { ne } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { getUserRoles } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("roles:manage");
  if (guard.error) return guard.error;
  const rows = db.select().from(users).where(ne(users.discordId, "system:tretu-dashboard")).orderBy(users.displayName).all();
  return ok(
    rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      discordId: u.discordId,
      roles: getUserRoles(String(u.id)),
      lastLoginAt: u.updatedAt.toISOString(),
    }))
  );
}
