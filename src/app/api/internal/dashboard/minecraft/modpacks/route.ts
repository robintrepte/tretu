import { searchCurseForgeModpacks } from "@/lib/minecraft/curseforge";
import { searchModpacks } from "@/lib/minecraft/modrinth";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100);
  const source = searchParams.get("source") ?? "modrinth";

  try {
    const safeLimit = Number.isFinite(limit) ? limit : 40;
    const hits =
      source === "curseforge"
        ? (await searchCurseForgeModpacks(q, safeLimit)).map((h) => ({
            id: h.modId,
            slug: h.slug,
            title: h.title,
            downloads: h.downloads,
            serverSide: "unknown",
            source: "curseforge" as const,
          }))
        : (await searchModpacks(q, safeLimit)).map((h) => ({
            id: h.projectId,
            slug: h.slug,
            title: h.title,
            downloads: h.downloads,
            serverSide: h.serverSide,
            source: "modrinth" as const,
          }));
    return ok({ hits });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Modpack search failed";
    return fail(msg, 502);
  }
}
