import { listCurseForgeModpackFiles } from "@/lib/minecraft/curseforge";
import { listProjectVersions } from "@/lib/minecraft/modrinth";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "modrinth";
  const id = searchParams.get("id");
  if (!id) return fail("id required", 400);

  try {
    const versions =
      source === "curseforge"
        ? (await listCurseForgeModpackFiles(id)).map((v) => ({
            id: v.fileId,
            name: v.displayName,
            versionNumber: v.displayName,
            gameVersions: v.gameVersions,
            primaryFile: { url: v.downloadUrl ?? "", filename: v.fileName },
            source: "curseforge" as const,
          }))
        : (await listProjectVersions(id)).map((v) => ({
            ...v,
            source: "modrinth" as const,
          }));
    return ok({ versions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Modpack versions failed";
    return fail(msg, 502);
  }
}
