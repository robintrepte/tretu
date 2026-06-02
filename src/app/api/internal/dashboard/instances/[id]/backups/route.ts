import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { backups } from "@/db/schema";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { createSnapshotBackup } from "@/lib/backup/service";
import { hasPermission } from "@/lib/permissions/checks";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);

  const instanceId = Number((await params).id);
  if (!Number.isFinite(instanceId)) return fail("Invalid id", 400);

  const data = db.select().from(backups).where(eq(backups.instanceId, instanceId)).orderBy(desc(backups.createdAt)).all();
  return ok(data);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "instances:backup")) return fail("Forbidden", 403);

  const instanceId = Number((await params).id);
  if (!Number.isFinite(instanceId)) return fail("Invalid id", 400);

  await createSnapshotBackup(instanceId, Number(userId));
  return ok({ queued: true }, { status: 202 });
}
