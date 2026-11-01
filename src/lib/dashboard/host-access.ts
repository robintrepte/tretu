import path from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { HOST_DATA } from "@/lib/games/runtime";
import { LocalizedError } from "@/lib/i18n/errors";
import { getActiveServer } from "@/lib/orchestrator/host";

export class HostAccessError extends LocalizedError {
  constructor(key: string, status: number) {
    super(key, {}, status);
  }
}

/** Instance + IP of its running VM, for features that talk to the host directly. */
export async function requireRunningHost(instanceId: number) {
  const [instance] = await db
    .select()
    .from(gameInstances)
    .where(and(eq(gameInstances.id, instanceId), isNull(gameInstances.archivedAt)))
    .limit(1);
  if (!instance) throw new HostAccessError("serverNotFound", 404);
  const server = await getActiveServer(instanceId);
  if (!server?.ipV4 || server.status !== "running") {
    throw new HostAccessError("serverOff", 409);
  }
  return { instance, ip: server.ipV4 };
}

/** Resolves a user-supplied path inside the game data directory; rejects anything outside. */
export function resolveDataPath(relative: string | null | undefined): string {
  const cleaned = path.posix.normalize(`/${relative ?? ""}`).replace(/\/+$/, "");
  const full = `${HOST_DATA}${cleaned === "/" ? "" : cleaned}`;
  if (full !== HOST_DATA && !full.startsWith(`${HOST_DATA}/`)) throw new HostAccessError("invalidPath", 400);
  return full;
}

export function relativeDataPath(full: string): string {
  return full === HOST_DATA ? "" : full.slice(HOST_DATA.length + 1);
}
