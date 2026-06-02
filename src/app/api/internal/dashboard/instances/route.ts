import { desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { actionJobs, gameInstances, instanceStatusSnapshots } from "@/db/schema";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { HETZNER_DEFAULT_VOLUME_GB } from "@/lib/env/server";
import { hasPermission } from "@/lib/permissions/checks";
import { instanceCreateSchema } from "@/lib/validation/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);

  const instances = db.select().from(gameInstances).where(isNull(gameInstances.archivedAt)).all();
  const result = instances.map((instance) => {
    const latestStatus = db
      .select()
      .from(instanceStatusSnapshots)
      .where(eq(instanceStatusSnapshots.instanceId, instance.id))
      .orderBy(desc(instanceStatusSnapshots.createdAt))
      .get();
    return { ...instance, latestStatus: latestStatus ?? null };
  });

  return ok(result);
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "instances:create")) return fail("Forbidden", 403);

  const parsed = instanceCreateSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message, 422);

  const requestedByUserId = Number(userId);
  if (!Number.isFinite(requestedByUserId)) return fail("Unauthorized", 401);

  const { volumeSizeGb: volumeGbFromForm, ...instanceValues } = parsed.data;
  const result = db.insert(gameInstances).values(instanceValues).run();
  const instanceId = Number(result.lastInsertRowid);
  const volumeSizeGb = volumeGbFromForm ?? HETZNER_DEFAULT_VOLUME_GB;

  db.insert(actionJobs)
    .values({
      instanceId,
      actionType: "createVolume",
      requestedByUserId,
      payloadJson: { sizeGb: volumeSizeGb },
      idempotencyKey: `createVolume-${instanceId}`,
      status: "queued",
    })
    .run();

  return ok({ id: instanceId }, { status: 201 });
}
