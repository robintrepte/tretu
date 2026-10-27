import { hetznerClient } from "@/lib/hetzner/client";
import { getJsonSetting, setJsonSetting } from "@/lib/settings/store";
import type { HetznerOptions, ServerTypeOption } from "@/lib/hetzner/types";

const CACHE_KEY = "cache.hetznerOptions";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type Cached = { fetchedAt: number; options: HetznerOptions };

async function fetchOptions(): Promise<HetznerOptions> {
  const [locations, serverTypes, availability, volumePrice] = await Promise.all([
    hetznerClient.listLocations(),
    hetznerClient.listServerTypes(),
    hetznerClient.availableServerTypesByLocation(),
    hetznerClient.volumePricePerGbMonth().catch(() => null),
  ]);

  const types: ServerTypeOption[] = serverTypes
    // Game server images (SteamCMD) are x86-only.
    .filter((t) => t.architecture === "x86" && !t.deprecation)
    .map((t) => ({
      name: t.name,
      description: t.description,
      cores: t.cores,
      memoryGb: t.memory,
      diskGb: t.disk,
      dedicatedCpu: t.cpu_type === "dedicated",
      prices: Object.fromEntries(
        t.prices.map((p) => [p.location, { hourly: Number(p.price_hourly.gross), monthly: Number(p.price_monthly.gross) }])
      ),
      availableIn: Object.entries(availability)
        .filter(([, ids]) => ids.includes(t.id))
        .map(([location]) => location),
    }))
    .sort((a, b) => a.memoryGb - b.memoryGb || a.cores - b.cores || Number(a.dedicatedCpu) - Number(b.dedicatedCpu));

  return {
    locations: locations.map((l) => ({ name: l.name, city: l.city, country: l.country, networkZone: l.network_zone })),
    serverTypes: types,
    volumePricePerGbMonth: volumePrice,
  };
}

export async function getHetznerOptions(opts?: { refresh?: boolean }): Promise<HetznerOptions> {
  const cached = getJsonSetting<Cached>(CACHE_KEY);
  if (!opts?.refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.options;
  try {
    const options = await fetchOptions();
    setJsonSetting(CACHE_KEY, { fetchedAt: Date.now(), options } satisfies Cached);
    return options;
  } catch (error) {
    if (cached) return cached.options;
    throw error;
  }
}

/** RAM of a server type in GB (from the cached Hetzner catalog). */
export async function serverTypeMemoryGb(serverType: string): Promise<number> {
  const options = await getHetznerOptions();
  const type = options.serverTypes.find((t) => t.name === serverType);
  if (!type) throw new Error(`Hetzner-Servertyp „${serverType}“ ist unbekannt oder nicht mehr verfügbar.`);
  return type.memoryGb;
}
