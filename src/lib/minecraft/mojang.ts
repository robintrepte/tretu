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
