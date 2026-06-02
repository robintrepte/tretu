import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";
import { instanceUpdateSchema } from "@/lib/validation/dashboard";

function toId(id: string): number | null {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);
  const id = toId((await params).id);
  if (!id) return fail("Invalid id", 400);

  const instance = db
    .select()
    .from(gameInstances)
    .where(and(eq(gameInstances.id, id), isNull(gameInstances.archivedAt)))
    .get();
  if (!instance) return fail("Not found", 404);
  return ok(instance);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "instances:update")) return fail("Forbidden", 403);
  const id = toId((await params).id);
  if (!id) return fail("Invalid id", 400);

  const parsed = instanceUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message, 422);

  db.update(gameInstances)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(gameInstances.id, id))
    .run();
  return ok({ id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "instances:delete")) return fail("Forbidden", 403);
  const id = toId((await params).id);
  if (!id) return fail("Invalid id", 400);

  db.update(gameInstances)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(gameInstances.id, id))
    .run();
  return ok({ id });
}
