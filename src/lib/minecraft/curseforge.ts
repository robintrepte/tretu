import { CURSEFORGE_API_KEY } from "@/lib/env/server";

const API = "https://api.curseforge.com/v1";
const GAME_ID_MINECRAFT = 432;
const CLASS_ID_MODPACK = 4471;

type CfSearchResponse = {
  data: Array<{
    id: number;
    name: string;
    slug: string;
    summary: string;
    downloadCount: number;
  }>;
};

type CfFilesResponse = {
  data: Array<{
    id: number;
    displayName: string;
    fileName: string;
    downloadUrl: string | null;
    gameVersions: string[];
    isAvailable: boolean;
  }>;
};

type CfDownloadUrlResponse = {
  data: string;
};

function assertApiKey() {
  if (!CURSEFORGE_API_KEY) {
    throw new Error("CURSEFORGE_API_KEY ist nicht gesetzt.");
  }
}

async function cffetch<T>(path: string): Promise<T> {
  assertApiKey();
  const response = await fetch(`${API}${path}`, {
    cache: "no-store",
    headers: { "x-api-key": CURSEFORGE_API_KEY },
  });
  if (!response.ok) {
    throw new Error(`CurseForge API ${response.status}: ${path}`);
  }
  return (await response.json()) as T;
}

export type CurseForgeModpackHit = {
  modId: string;
  slug: string;
  title: string;
  description: string;
  downloads: number;
};

export type CurseForgeFileSummary = {
  fileId: string;
  displayName: string;
  fileName: string;
  gameVersions: string[];
  downloadUrl: string | null;
};

export async function searchCurseForgeModpacks(query: string, pageSize = 40): Promise<CurseForgeModpackHit[]> {
  const q = encodeURIComponent(query || "");
  const size = Math.min(Math.max(pageSize, 1), 50);
  const data = await cffetch<CfSearchResponse>(
    `/mods/search?gameId=${GAME_ID_MINECRAFT}&classId=${CLASS_ID_MODPACK}&searchFilter=${q}&sortField=2&sortOrder=desc&pageSize=${size}`
  );
  return data.data.map((m) => ({
    modId: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary ?? "",
    downloads: Math.floor(m.downloadCount ?? 0),
  }));
}

export async function listCurseForgeModpackFiles(modId: string): Promise<CurseForgeFileSummary[]> {
  const id = Number(modId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Ungültige CurseForge modId.");
  }
  const res = await cffetch<CfFilesResponse>(`/mods/${id}/files?pageSize=100&index=0`);
  return res.data
    .filter((f) => f.isAvailable)
    .map((f) => ({
      fileId: String(f.id),
      displayName: f.displayName || f.fileName,
      fileName: f.fileName,
      gameVersions: f.gameVersions ?? [],
      downloadUrl: f.downloadUrl,
    }));
}

export async function resolveCurseForgeFileDownload(modId: string, fileId: string): Promise<{ url: string; filename: string }> {
  const m = Number(modId);
  const f = Number(fileId);
  if (!Number.isFinite(m) || !Number.isFinite(f) || m <= 0 || f <= 0) {
    throw new Error("Ungültige CurseForge modId/fileId.");
  }

  const byEndpoint = await cffetch<CfDownloadUrlResponse>(`/mods/${m}/files/${f}/download-url`);
  const url = byEndpoint.data;
  if (!url) {
    throw new Error("CurseForge hat keine Download-URL für diese Datei geliefert.");
  }

  const filename = url.split("/").pop() || `curseforge-${m}-${f}.zip`;
  return { url, filename };
}
