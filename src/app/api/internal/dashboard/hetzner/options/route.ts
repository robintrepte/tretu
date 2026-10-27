import { requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import { getDefaultLocation } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    return ok({ ...(await getHetznerOptions({ refresh })), defaultLocation: getDefaultLocation() });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Hetzner nicht erreichbar.", 502);
  }
}
