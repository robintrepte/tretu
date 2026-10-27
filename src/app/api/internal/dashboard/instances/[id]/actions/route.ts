import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { parseId, readJson, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { ACTION_TYPES, type ActionType } from "@/lib/orchestrator/action-types";
import { enqueueJob } from "@/lib/orchestrator/jobs";
import type { Permission } from "@/lib/permissions/types";
import { getSetupStatus } from "@/lib/settings/store";

const ACTION_PERMISSIONS: Record<Exclude<ActionType, "destroy">, Permission> = {
  start: "instances:start",
  stop: "instances:stop",
  restart: "instances:restart",
  apply: "instances:config",
  hibernate: "instances:stop",
  backup: "instances:backup",
  restore: "instances:restore",
  deleteBackup: "instances:restore",
  resizeVolume: "instances:update",
  wipe: "instances:delete",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJson(request);
  const action = String(body.action ?? "") as ActionType;
  if (!ACTION_TYPES.includes(action) || action === "destroy") return fail("Unbekannte Aktion.", 400);

  const guard = await requirePermission(ACTION_PERMISSIONS[action]);
  if (guard.error) return guard.error;
  if (!getSetupStatus().ready) return fail("Hetzner ist noch nicht eingerichtet.", 409);

  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);
  const instance = db
    .select({ id: gameInstances.id })
    .from(gameInstances)
    .where(and(eq(gameInstances.id, id), isNull(gameInstances.archivedAt)))
    .get();
  if (!instance) return fail("Server nicht gefunden.", 404);

  const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
  const { jobId, deduplicated } = enqueueJob({ instanceId: id, actionType: action, userId: guard.userId, payload });
  return ok({ jobId, deduplicated }, { status: 202 });
}
