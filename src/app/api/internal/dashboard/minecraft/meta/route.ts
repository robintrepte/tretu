import { listForgeMinecraftVersions } from "@/lib/minecraft/forge";
import { listMinecraftReleases } from "@/lib/minecraft/mojang";
import { listPaperMinecraftVersions } from "@/lib/minecraft/paper";
import { ok, fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return fail("Unauthorized", 401);
  if (!hasPermission(userId, "dashboard:view")) return fail("Forbidden", 403);

  try {
    const [releases, paperVersions, forgeMcVersions] = await Promise.all([
      listMinecraftReleases(),
      listPaperMinecraftVersions(),
      listForgeMinecraftVersions(),
    ]);

    const vanilla = releases.map((r) => r.id);
    const vanillaSet = new Set(vanilla);
    const paperForReleases = paperVersions.filter((v) => vanillaSet.has(v));
    const forgeForReleases = forgeMcVersions.filter((v) => vanillaSet.has(v));

    return ok({
      vanilla,
      latestRelease: vanilla[0] ?? "1.21.1",
      paper: paperForReleases.length > 0 ? paperForReleases : paperVersions,
      forge: forgeForReleases.length > 0 ? forgeForReleases : forgeMcVersions,
      sources: {
        vanilla: "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
        paper: "https://api.papermc.io/v2/projects/paper",
        forge: "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
        modpacks: "https://api.modrinth.com/v2/",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Meta fetch failed";
    return fail(msg, 502);
  }
}
