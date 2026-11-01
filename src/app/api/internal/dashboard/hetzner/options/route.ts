import { requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failFromError } from "@/lib/api/errors";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import { getDefaultLocation } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    return ok({ ...(await getHetznerOptions({ refresh })), defaultLocation: await getDefaultLocation() });
  } catch (error) {
    return failFromError(error, { wrapKey: "hetznerUnreachable" });
  }
}
