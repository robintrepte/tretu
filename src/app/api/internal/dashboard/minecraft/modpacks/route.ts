import { requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { searchCurseForgeModpacks } from "@/lib/minecraft/curseforge";
import { searchModpacks } from "@/lib/minecraft/modrinth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const source = searchParams.get("source") === "curseforge" ? "curseforge" : "modrinth";

  try {
    const hits =
      source === "curseforge"
        ? (await searchCurseForgeModpacks(q, 25)).map((h) => ({
            id: h.modId,
            slug: h.slug,
            title: h.title,
            description: h.description,
            downloads: h.downloads,
            iconUrl: h.iconUrl,
          }))
        : (await searchModpacks(q, 25)).map((h) => ({
            id: h.projectId,
            slug: h.slug,
            title: h.title,
            description: h.description,
            downloads: h.downloads,
            iconUrl: h.iconUrl,
          }));
    return ok({ hits });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Modpack-Suche fehlgeschlagen.", 502);
  }
}
