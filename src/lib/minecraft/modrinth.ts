const API = "https://api.modrinth.com/v2";

export type ModrinthModpackHit = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  downloads: number;
  iconUrl: string | null;
  serverSide: string;
};

export type ModrinthVersionSummary = {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  primaryFile: { url: string; filename: string };
};

type SearchResponse = {
  hits: Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    downloads: number;
    icon_url: string | null;
    server_side?: string;
  }>;
};

type VersionFile = {
  url: string;
  filename: string;
  primary?: boolean;
};

type ModrinthVersion = {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  files: VersionFile[];
};

function facetsParam(): string {
  return encodeURIComponent(JSON.stringify([["project_type:modpack"]]));
}

export async function searchModpacks(query: string, limit = 30): Promise<ModrinthModpackHit[]> {
  const q = encodeURIComponent(query || "");
  const url = `${API}/search?query=${q}&facets=${facetsParam()}&limit=${encodeURIComponent(String(limit))}&index=downloads`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Modrinth search ${res.status}`);
  const data = (await res.json()) as SearchResponse;
  return data.hits.map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    downloads: h.downloads,
    iconUrl: h.icon_url,
    serverSide: h.server_side ?? "unknown",
  }));
}

function pickPrimaryFile(files: VersionFile[]): VersionFile {
  const primary = files.find((f) => f.primary);
  if (primary) return primary;
  if (files[0]) return files[0];
  throw new Error("Modrinth-Version enthält keine Dateien.");
}

export async function listProjectVersions(projectId: string): Promise<ModrinthVersionSummary[]> {
  const url = `${API}/project/${encodeURIComponent(projectId)}/version`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Modrinth versions ${res.status}`);
  const data = (await res.json()) as ModrinthVersion[];
  return data.map((v) => {
    const file = pickPrimaryFile(v.files);
    return {
      id: v.id,
      name: v.name,
      versionNumber: v.version_number,
      gameVersions: v.game_versions,
      primaryFile: { url: file.url, filename: file.filename },
    };
  });
}

export type ModrinthProjectHit = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  downloads: number;
  iconUrl: string | null;
};

/** Searches server-compatible mods or plugins for a loader (and optionally a game version). */
export async function searchProjects(input: {
  query: string;
  type: "mod" | "plugin";
  category: string;
  gameVersion?: string;
  limit?: number;
}): Promise<ModrinthProjectHit[]> {
  const facets: string[][] = [
    [`project_type:${input.type}`],
    [`categories:${input.category}`],
    ["server_side:required", "server_side:optional"],
  ];
  if (input.gameVersion && input.gameVersion !== "LATEST") facets.push([`versions:${input.gameVersion}`]);
  const params = new URLSearchParams({
    query: input.query,
    facets: JSON.stringify(facets),
    limit: String(Math.min(input.limit ?? 20, 50)),
    index: input.query ? "relevance" : "downloads",
  });
  const res = await fetch(`${API}/search?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Modrinth search ${res.status}`);
  const data = (await res.json()) as SearchResponse;
  return data.hits.map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    downloads: h.downloads,
    iconUrl: h.icon_url,
  }));
}
