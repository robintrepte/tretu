import { requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failFromError } from "@/lib/api/errors";
import { listMinecraftVersionsByLoader } from "@/lib/minecraft/loaders";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  try {
    return ok(await listMinecraftVersionsByLoader());
  } catch (e) {
    return failFromError(e, { wrapKey: "versionsFailed" });
  }
}
