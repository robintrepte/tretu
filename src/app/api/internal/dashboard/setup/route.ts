import { readJson, requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failFromError, failKey } from "@/lib/api/errors";
import { getHetznerOptions } from "@/lib/hetzner/catalog";
import {
  connectCloudflare,
  connectCurseForge,
  connectHetzner,
  disconnectCloudflare,
  disconnectCurseForge,
} from "@/lib/settings/setup";
import { getSetupSnapshot, SETTING_KEYS, setSetting } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("settings:manage");
  if (guard.error) return guard.error;
  return ok(await getSetupSnapshot());
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
        if (!options.locations.some((l) => l.name === location)) return failKey("unknownLocation", 422);
        await setSetting(SETTING_KEYS.hetznerLocation, location);
        break;
      }
      case "cloudflare":
        if (body.remove === true) await disconnectCloudflare();
        else await connectCloudflare({ token: String(body.token ?? ""), domain: String(body.domain ?? "") });
        break;
      case "curseforge":
        if (body.remove === true) await disconnectCurseForge();
        else await connectCurseForge(String(body.apiKey ?? ""));
        break;
      default:
        return failKey("unknownSection", 400);
    }
  } catch (error) {
    return failFromError(error, { status: 422 });
  }
  return ok(await getSetupSnapshot());
}
