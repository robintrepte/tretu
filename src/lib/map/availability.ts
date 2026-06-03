import { MINECRAFT_MAP_URL } from "@/lib/map/url";

const CHECK_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;

let cache: { available: boolean; checkedAt: number } | null = null;

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

function isUnavailableStatus(status: number): boolean {
  return status === 404 || status === 502 || status === 503 || status === 504;
}

async function probeMap(method: "HEAD" | "GET"): Promise<number | null> {
  try {
    const res = await fetch(MINECRAFT_MAP_URL, {
      method,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return null;
  }
}

export async function isMinecraftMapAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.checkedAt < CACHE_TTL_MS) {
    return cache.available;
  }

  for (const method of ["HEAD", "GET"] as const) {
    const status = await probeMap(method);
    if (status === null) continue;
    if (isSuccessStatus(status)) {
      cache = { available: true, checkedAt: now };
      return true;
    }
    if (isUnavailableStatus(status)) {
      cache = { available: false, checkedAt: now };
      return false;
    }
  }

  cache = { available: false, checkedAt: now };
  return false;
}
