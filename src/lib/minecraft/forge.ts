const FORGE_PROMOS = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";

type PromotionsFile = {
  promos: Record<string, string>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Forge promos ${res.status}`);
  return (await res.json()) as T;
}

export async function listForgeMinecraftVersions(): Promise<string[]> {
  const data = await fetchJson<PromotionsFile>(FORGE_PROMOS);
  const mc = new Set<string>();
  for (const key of Object.keys(data.promos)) {
    const m = /^([\d.]+)-(latest|recommended)$/.exec(key);
    if (m) mc.add(m[1]);
  }
  return Array.from(mc).sort((a, b) => {
    const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
    const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const da = pa[i] ?? 0;
      const db = pb[i] ?? 0;
      if (da !== db) return db - da;
    }
    return 0;
  });
}

/**
 * Forge Maven installer: mcVersion-forgePart (e.g. 1.21.1-52.1.0).
 */
export async function resolveForgeInstallerUrl(mcVersion: string): Promise<{ installerUrl: string; fullCoordinate: string }> {
  const data = await fetchJson<PromotionsFile>(FORGE_PROMOS);
  const promos = data.promos;
  const recommended = promos[`${mcVersion}-recommended`];
  const latest = promos[`${mcVersion}-latest`];
  const forgePart = recommended ?? latest;
  if (!forgePart) {
    throw new Error(`Keine Forge-Stände für Minecraft ${mcVersion} (promotions_slim.json).`);
  }
  const fullCoordinate = `${mcVersion}-${forgePart}`;
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullCoordinate}/forge-${fullCoordinate}-installer.jar`;
  return { installerUrl, fullCoordinate };
}
