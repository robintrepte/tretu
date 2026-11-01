import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { parseId, readJson, requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failFromError, failKey } from "@/lib/api/errors";
import { cloudflareClient } from "@/lib/cloudflare/client";
import {
  buildMinecraftSource,
  buildSettings,
  InputError,
  requireDefinition,
  validateIdleMinutes,
  validateName,
  validateServerType,
  validateSubdomain,
} from "@/lib/dashboard/instance-input";
import { getInstanceDetail } from "@/lib/dashboard/view";
import { readProfile } from "@/lib/games/profile";
import { getActiveServer, getVolume } from "@/lib/orchestrator/host";
import { enqueueJob } from "@/lib/orchestrator/jobs";
import { getCloudflareConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function loadInstance(id: number) {
  const [row] = await db
    .select()
    .from(gameInstances)
    .where(and(eq(gameInstances.id, id), isNull(gameInstances.archivedAt)))
    .limit(1);
  return row;
}

export async function GET(_request: Request, { params }: Params) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return failKey("invalidId", 400);
  const detail = await getInstanceDetail(id);
  if (!detail) return failKey("serverNotFound", 404);
  return ok(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const guard = await requirePermission("instances:update");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return failKey("invalidId", 400);
  const instance = await loadInstance(id);
  if (!instance) return failKey("serverNotFound", 404);

  const body = await readJson(request);
  try {
    const def = requireDefinition(instance.gameType);
    const profile = readProfile(instance.gameType, instance.configProfile);
    const updates: Partial<typeof gameInstances.$inferInsert> = {};
    let runtimeChanged = false;

    if (body.name !== undefined) updates.name = validateName(body.name);
    if (body.settings !== undefined) {
      profile.settings = buildSettings(def, body.settings, profile.settings);
      runtimeChanged = true;
    }
    if (body.minecraft !== undefined && def.id === "minecraft") {
      profile.minecraft = buildMinecraftSource(body.minecraft);
      runtimeChanged = true;
    }
    if (runtimeChanged) updates.configProfile = profile;

    if (body.serverType !== undefined || body.region !== undefined) {
      const region = body.region ?? instance.region;
      if (region !== instance.region && (await getVolume(instance.id))) {
        throw new InputError("locationLocked");
      }
      const validated = await validateServerType(def, body.serverType ?? instance.activeServerType, region);
      updates.activeServerType = validated.serverType;
      updates.region = validated.region;
    }
    if (body.idleMinutes !== undefined) updates.idleDeleteAfterMinutes = validateIdleMinutes(body.idleMinutes);
    if (body.backupRetention !== undefined) {
      const n = Math.round(Number(body.backupRetention));
      if (!Number.isFinite(n) || n < 1 || n > 50) throw new InputError("backupRetention");
      updates.backupRetention = n;
    }
    if (body.backupOnHibernate !== undefined) updates.backupOnHibernate = body.backupOnHibernate === true;

    if (body.subdomain !== undefined) {
      const subdomain = await validateSubdomain(body.subdomain, instance.id);
      if (subdomain !== instance.subdomain) {
        const cf = await getCloudflareConfig();
        if (cf?.zoneId && instance.dnsRecordId) {
          await cloudflareClient.deleteRecord(cf.token, cf.zoneId, instance.dnsRecordId).catch(() => undefined);
        }
        updates.subdomain = subdomain;
        updates.dnsRecordId = null;
        runtimeChanged = true;
      }
    }

    await db
      .update(gameInstances)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameInstances.id, id));

    const hostRunning = Boolean(await getActiveServer(id));
    let applyJobId: number | null = null;
    if (runtimeChanged && hostRunning && body.apply !== false) {
      applyJobId = (await enqueueJob({ instanceId: id, actionType: "apply", userId: guard.userId })).jobId;
    }
    return ok({
      id,
      applyJobId,
      serverTypeChangedWhileRunning: hostRunning && updates.activeServerType !== undefined && updates.activeServerType !== instance.activeServerType,
    });
  } catch (error) {
    if (error instanceof InputError) return failFromError(error);
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requirePermission("instances:delete");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return failKey("invalidId", 400);
  const instance = await loadInstance(id);
  if (!instance) return failKey("serverNotFound", 404);

  const body = await readJson(request);
  if (String(body.confirm ?? "").trim() !== instance.name) {
    return failKey("confirmName", 422);
  }
  const { jobId } = await enqueueJob({ instanceId: id, actionType: "destroy", userId: guard.userId });
  return ok({ jobId }, { status: 202 });
}
