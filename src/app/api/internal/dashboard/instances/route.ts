import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { readJson, requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failFromError, failKey } from "@/lib/api/errors";
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
  if (!(await getSetupStatus()).ready) return failKey("hetznerNotSetUp", 409);

  const body = await readJson(request);
  try {
    const def = requireCreatableDefinition(body.gameType);
    const name = validateName(body.name);
    const slug = await uniqueSlug(slugify(String(body.slug || name)));
    const { serverType, region } = await validateServerType(def, body.serverType, body.region);
    const profile = newProfile(def, body);
    const subdomain = await validateSubdomain(body.subdomain ?? slug);

    const [created] = await db
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
      .returning({ id: gameInstances.id });
    const id = created!.id;

    if (body.startNow !== false) await enqueueJob({ instanceId: id, actionType: "start", userId: guard.userId });
    return ok({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof InputError) return failFromError(error);
    throw error;
  }
}
