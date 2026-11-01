import { eq } from "drizzle-orm";

import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { parseId, readJson, requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failKey } from "@/lib/api/errors";
import { setUserRoles } from "@/lib/permissions/checks";
import { ROLES, type Role } from "@/lib/permissions/types";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("roles:manage");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return failKey("invalidId", 400);
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (!target) return failKey("userNotFound", 404);

  const body = await readJson(request);
  const roles = (Array.isArray(body.roles) ? body.roles : []).filter((r): r is Role => ROLES.includes(r as Role));
  if (id === guard.userId && !roles.includes("admin")) {
    return failKey("selfDemote", 422);
  }

  await setUserRoles(id, roles);
  await db
    .insert(auditEvents)
    .values({ userId: guard.userId, eventType: "roles.updated", metaJson: { targetUserId: id, roles } });
  return ok({ id, roles });
}
