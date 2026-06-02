import { compareMinecraftVersionDesc } from "@/lib/minecraft/version-sort";

const VERSION_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

export type MojangReleaseSummary = {
  id: string;
  releaseTime: string;
};

type VersionManifest = {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string; time: string; releaseTime: string }>;
};

type VersionDetail = {
  downloads?: { server?: { url: string; sha1: string } };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return (await res.json()) as T;
}

export async function listMinecraftReleases(): Promise<MojangReleaseSummary[]> {
  const manifest = await fetchJson<VersionManifest>(VERSION_MANIFEST);
  const releases = manifest.versions
    .filter((v) => v.type === "release")
    .map((v) => ({ id: v.id, releaseTime: v.releaseTime }));
  releases.sort((a, b) => compareMinecraftVersionDesc(a.id, b.id));
  return releases;
}

export async function resolveVanillaServerJarUrl(minecraftVersion: string): Promise<string> {
  const manifest = await fetchJson<VersionManifest>(VERSION_MANIFEST);
  const entry = manifest.versions.find((v) => v.id === minecraftVersion && v.type === "release");
  if (!entry) {
    throw new Error(`Keine Vanilla-Release-Version „${minecraftVersion}“ im Mojang-Manifest.`);
  }
  const detail = await fetchJson<VersionDetail>(entry.url);
  const url = detail.downloads?.server?.url;
  if (!url) {
    throw new Error(`Mojang liefert keine server.jar-URL für „${minecraftVersion}“.`);
  }
  return url;
}
