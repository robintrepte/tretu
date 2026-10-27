import { readJson, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import {
  connectCloudflare,
  connectCurseForge,
  connectHetzner,
  disconnectCloudflare,
  disconnectCurseForge,
} from "@/lib/settings/setup";
import {
  getCloudflareConfig,
  getDefaultLocation,
  getSetupStatus,
  getSshCredentials,
  SETTING_KEYS,
  setSetting,
} from "@/lib/settings/store";

export const dynamic = "force-dynamic";

function snapshot() {
  const cf = getCloudflareConfig();
  return {
    status: getSetupStatus(),
    defaultLocation: getDefaultLocation(),
    cloudflareDomain: cf?.domain ?? null,
    sshPublicKey: getSshCredentials()?.publicKey ?? null,
  };
}

export async function GET() {
  const guard = await requirePermission("settings:manage");
  if (guard.error) return guard.error;
  return ok(snapshot());
}

export async function POST(request: Request) {
  const guard = await requirePermission("settings:manage");
  if (guard.error) return guard.error;
  const body = await readJson(request);

  try {
    switch (body.section) {
      case "hetzner":
        await connectHetzner(String(body.token ?? ""), typeof body.location === "string" ? body.location : undefined);
        break;
      case "location": {
        const location = String(body.location ?? "");
        const options = await getHetznerOptions();
        if (!options.locations.some((l) => l.name === location)) return fail("Unbekannter Standort.", 422);
        setSetting(SETTING_KEYS.hetznerLocation, location);
        break;
      }
      case "cloudflare":
        if (body.remove === true) disconnectCloudflare();
        else await connectCloudflare({ token: String(body.token ?? ""), domain: String(body.domain ?? "") });
        break;
      case "curseforge":
        if (body.remove === true) disconnectCurseForge();
        else await connectCurseForge(String(body.apiKey ?? ""));
        break;
      default:
        return fail("Unbekannter Bereich.", 400);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Speichern fehlgeschlagen.", 422);
  }
  return ok(snapshot());
}
