import { requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { listMinecraftVersionsByLoader } from "@/lib/minecraft/loaders";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  try {
    return ok(await listMinecraftVersionsByLoader());
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Versionsliste nicht abrufbar.", 502);
  }
}
