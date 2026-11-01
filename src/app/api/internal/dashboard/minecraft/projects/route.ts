import { requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failFromError, failKey } from "@/lib/api/errors";
import { modrinthProjectKind, type MinecraftLoader } from "@/lib/games/minecraft-source";
import { searchProjects } from "@/lib/minecraft/modrinth";

export const dynamic = "force-dynamic";

/** Modrinth mods/plugins matching the server's loader and Minecraft version. */
export async function GET(request: Request) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;

  const { searchParams } = new URL(request.url);
  const kind = modrinthProjectKind((searchParams.get("loader") ?? "") as MinecraftLoader);
  if (!kind) return failKey("noProjects", 400);

  try {
    const hits = await searchProjects({
      query: searchParams.get("q") ?? "",
      type: kind.type,
      category: kind.category,
      gameVersion: searchParams.get("version") ?? undefined,
    });
    return ok({ hits, kind: kind.type });
  } catch (e) {
    return failFromError(e, { wrapKey: "searchFailed" });
  }
}
