import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { readJson, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import {
  InputError,
  newProfile,
  requireCreatableDefinition,
  slugify,
  uniqueSlug,
  validateIdleMinutes,
  validateName,
  validateServerType,
  validateSubdomain,
} from "@/lib/dashboard/instance-input";
import { listInstanceSummaries } from "@/lib/dashboard/view";
import { enqueueJob } from "@/lib/orchestrator/jobs";
import { getSetupStatus } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  return ok(await listInstanceSummaries());
}

export async function POST(request: Request) {
  const guard = await requirePermission("instances:create");
  if (guard.error) return guard.error;
  if (!getSetupStatus().ready) return fail("Hetzner ist noch nicht eingerichtet.", 409);

  const body = await readJson(request);
  try {
    const def = requireCreatableDefinition(body.gameType);
    const name = validateName(body.name);
    const slug = uniqueSlug(slugify(String(body.slug || name)));
    const { serverType, region } = await validateServerType(def, body.serverType, body.region);
    const profile = newProfile(def, body);
    const subdomain = validateSubdomain(body.subdomain ?? slug);

    const res = db
      .insert(gameInstances)
      .values({
        slug,
        name,
        gameType: def.id,
        region,
        activeServerType: serverType,
        desiredState: "offline",
        configProfile: profile,
        idleDeleteAfterMinutes: validateIdleMinutes(body.idleMinutes ?? 30),
        subdomain,
      })
      .run();
    const id = Number(res.lastInsertRowid);

    if (body.startNow !== false) enqueueJob({ instanceId: id, actionType: "start", userId: guard.userId });
    return ok({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof InputError) return fail(error.message, 422);
    throw error;
  }
}
