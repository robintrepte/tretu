import { listMinecraftReleases } from "@/lib/minecraft/mojang";
import { compareMinecraftVersionDesc } from "@/lib/minecraft/version-sort";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "tretu-dashboard (tretu.de)" }, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function paperVersions(): Promise<string[]> {
  try {
    const data = await fetchJson<{ versions: Record<string, string[]> }>("https://fill.papermc.io/v3/projects/paper");
    return Object.values(data.versions).flat();
  } catch {
    const data = await fetchJson<{ versions: string[] }>("https://api.papermc.io/v2/projects/paper");
    return data.versions;
  }
}

async function purpurVersions(): Promise<string[]> {
  const data = await fetchJson<{ versions: string[] }>("https://api.purpurmc.org/v2/purpur");
  return data.versions;
}

async function fabricVersions(): Promise<string[]> {
  const data = await fetchJson<Array<{ version: string; stable: boolean }>>("https://meta.fabricmc.net/v2/versions/game");
  return data.filter((v) => v.stable).map((v) => v.version);
}

async function forgeVersions(): Promise<string[]> {
  const data = await fetchJson<{ promos: Record<string, string> }>(
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
  );
  const mc = new Set<string>();
  for (const key of Object.keys(data.promos)) {
    const m = /^([\d.]+)-(latest|recommended)$/.exec(key);
    if (m) mc.add(m[1]);
  }
  return [...mc];
}

/** NeoForge versions encode the Minecraft version: 21.1.x → 1.21.1, 20.4.x → 1.20.4, 21.0.x → 1.21. */
async function neoforgeVersions(): Promise<string[]> {
  const data = await fetchJson<{ versions: string[] }>(
    "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge"
  );
  const mc = new Set<string>();
  for (const v of data.versions) {
    if (/beta|alpha/i.test(v)) continue;
    const [major, minor] = v.split(".");
    if (!major || minor === undefined) continue;
    mc.add(Number(major) >= 26 ? `${major}.${minor}` : minor === "0" ? `1.${major}` : `1.${major}.${minor}`);
  }
  return [...mc];
}

const LOADER_LISTS: Record<string, () => Promise<string[]>> = {
  paper: paperVersions,
  purpur: purpurVersions,
  fabric: fabricVersions,
  forge: forgeVersions,
  neoforge: neoforgeVersions,
};

export type MinecraftVersionLists = { latestRelease: string; versions: Record<string, string[]> };

/** Release versions per loader (only versions that exist as Mojang releases). */
export async function listMinecraftVersionsByLoader(): Promise<MinecraftVersionLists> {
  const releases = (await listMinecraftReleases()).map((r) => r.id);
  const releaseSet = new Set(releases);

  const entries = await Promise.all(
    Object.entries(LOADER_LISTS).map(async ([loader, list]) => {
      try {
        const versions = (await list()).filter((v) => releaseSet.has(v));
        return [loader, [...new Set(versions)].sort(compareMinecraftVersionDesc)] as const;
      } catch {
        // Upstream API down: offer all releases, itzg reports unsupported combinations on start.
        return [loader, releases] as const;
      }
    })
  );

  return { latestRelease: releases[0] ?? "LATEST", versions: { vanilla: releases, ...Object.fromEntries(entries) } };
}
