import { compareMinecraftVersionDesc } from "@/lib/minecraft/version-sort";

const PAPER_PROJECT = "https://api.papermc.io/v2/projects/paper";

type PaperProject = {
  versions: string[];
};

type PaperVersionBuilds = {
  version: string;
  builds: number[];
};

type PaperBuild = {
  version: string;
  build: number;
  downloads: { application: { name: string } };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Paper API ${res.status}: ${url}`);
  return (await res.json()) as T;
}

export async function listPaperMinecraftVersions(): Promise<string[]> {
  const project = await fetchJson<PaperProject>(PAPER_PROJECT);
  const versions = [...project.versions];
  versions.sort(compareMinecraftVersionDesc);
  return versions;
}

export async function resolvePaperJarDownload(minecraftVersion: string): Promise<{ url: string; filename: string }> {
  const buildsMeta = await fetchJson<PaperVersionBuilds>(
    `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(minecraftVersion)}`
  );
  if (!buildsMeta.builds?.length) {
    throw new Error(`Paper hat keine Builds für „${minecraftVersion}“.`);
  }
  const lastBuild = buildsMeta.builds[buildsMeta.builds.length - 1];
  const build = await fetchJson<PaperBuild>(
    `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(minecraftVersion)}/builds/${lastBuild}`
  );
  const filename = build.downloads.application.name;
  const url = `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(minecraftVersion)}/builds/${lastBuild}/downloads/application`;
  return { url, filename };
}
