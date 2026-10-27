import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { parseId, readJson, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
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

function loadInstance(id: number) {
  return db
    .select()
    .from(gameInstances)
    .where(and(eq(gameInstances.id, id), isNull(gameInstances.archivedAt)))
    .get();
}

export async function GET(_request: Request, { params }: Params) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);
  const detail = await getInstanceDetail(id);
  if (!detail) return fail("Server nicht gefunden.", 404);
  return ok(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const guard = await requirePermission("instances:update");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);
  const instance = loadInstance(id);
  if (!instance) return fail("Server nicht gefunden.", 404);

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
      if (region !== instance.region && getVolume(instance.id)) {
        throw new InputError("Der Standort kann nach dem ersten Start nicht mehr geändert werden (der Speicher liegt dort).");
      }
      const validated = await validateServerType(def, body.serverType ?? instance.activeServerType, region);
      updates.activeServerType = validated.serverType;
      updates.region = validated.region;
    }
    if (body.idleMinutes !== undefined) updates.idleDeleteAfterMinutes = validateIdleMinutes(body.idleMinutes);
    if (body.backupRetention !== undefined) {
      const n = Math.round(Number(body.backupRetention));
      if (!Number.isFinite(n) || n < 1 || n > 50) throw new InputError("Backups behalten: 1–50.");
      updates.backupRetention = n;
    }
    if (body.backupOnHibernate !== undefined) updates.backupOnHibernate = body.backupOnHibernate === true;

    if (body.subdomain !== undefined) {
      const subdomain = validateSubdomain(body.subdomain, instance.id);
      if (subdomain !== instance.subdomain) {
        const cf = getCloudflareConfig();
        if (cf?.zoneId && instance.dnsRecordId) {
          await cloudflareClient.deleteRecord(cf.token, cf.zoneId, instance.dnsRecordId).catch(() => undefined);
        }
        updates.subdomain = subdomain;
        updates.dnsRecordId = null;
        runtimeChanged = true;
      }
    }

    db.update(gameInstances)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameInstances.id, id))
      .run();

    const hostRunning = Boolean(getActiveServer(id));
    let applyJobId: number | null = null;
    if (runtimeChanged && hostRunning && body.apply !== false) {
      applyJobId = enqueueJob({ instanceId: id, actionType: "apply", userId: guard.userId }).jobId;
    }
    return ok({
      id,
      applyJobId,
      serverTypeChangedWhileRunning: hostRunning && updates.activeServerType !== undefined && updates.activeServerType !== instance.activeServerType,
    });
  } catch (error) {
    if (error instanceof InputError) return fail(error.message, 422);
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requirePermission("instances:delete");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);
  const instance = loadInstance(id);
  if (!instance) return fail("Server nicht gefunden.", 404);

  const body = await readJson(request);
  if (String(body.confirm ?? "").trim() !== instance.name) {
    return fail("Zur Bestätigung bitte den exakten Servernamen eingeben.", 422);
  }
  const { jobId } = enqueueJob({ instanceId: id, actionType: "destroy", userId: guard.userId });
  return ok({ jobId }, { status: 202 });
}
