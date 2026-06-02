import { eq } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, gameInstances } from "@/db/schema";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";
import { instanceActionSchema } from "@/lib/validation/dashboard";

const actionPermissions = {
  createVolume: "instances:create",
  provision: "instances:create",
  start: "instances:start",
  stop: "instances:stop",
  restart: "instances:restart",
  deleteHost: "instances:delete-host",
  backup: "instances:backup",
  restore: "instances:restore",
  updateConfig: "instances:config",
  updateVersion: "instances:version",
  syncMods: "instances:mods",
} as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  const resolved = await params;
  const instanceId = Number(resolved.id);
  if (!Number.isFinite(instanceId)) return fail("Invalid id", 400);

  const instance = db.select().from(gameInstances).where(eq(gameInstances.id, instanceId)).get();
  if (!instance) return fail("Instance not found", 404);

  const parsed = instanceActionSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message, 422);

  const requiredPermission = actionPermissions[parsed.data.actionType];
  if (!hasPermission(userId, requiredPermission)) return fail("Forbidden", 403);

  const requestedByUserId = Number(userId);
  if (!Number.isFinite(requestedByUserId)) return fail("Unauthorized", 401);

  const result = db
    .insert(actionJobs)
    .values({
      instanceId,
      actionType: parsed.data.actionType,
      requestedByUserId,
      payloadJson: parsed.data.payload,
      idempotencyKey: parsed.data.idempotencyKey,
      status: "queued",
    })
    .run();

  return ok({ jobId: Number(result.lastInsertRowid) }, { status: 202 });
}
