import { requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { modrinthProjectKind, type MinecraftLoader } from "@/lib/games/minecraft-source";
import { searchProjects } from "@/lib/minecraft/modrinth";

export const dynamic = "force-dynamic";

/** Modrinth mods/plugins matching the server's loader and Minecraft version. */
export async function GET(request: Request) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;

  const { searchParams } = new URL(request.url);
  const kind = modrinthProjectKind((searchParams.get("loader") ?? "") as MinecraftLoader);
  if (!kind) return fail("Für diesen Server-Typ gibt es keine Mods/Plugins.", 400);

  try {
    const hits = await searchProjects({
      query: searchParams.get("q") ?? "",
      type: kind.type,
      category: kind.category,
      gameVersion: searchParams.get("version") ?? undefined,
    });
    return ok({ hits, kind: kind.type });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Suche fehlgeschlagen.", 502);
  }
}
