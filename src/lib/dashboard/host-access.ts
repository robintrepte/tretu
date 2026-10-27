import path from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { HOST_DATA } from "@/lib/games/runtime";
import { getActiveServer } from "@/lib/orchestrator/host";

export class HostAccessError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** Instance + IP of its running VM, for features that talk to the host directly. */
export function requireRunningHost(instanceId: number) {
  const instance = db
    .select()
    .from(gameInstances)
    .where(and(eq(gameInstances.id, instanceId), isNull(gameInstances.archivedAt)))
    .get();
  if (!instance) throw new HostAccessError("Server nicht gefunden.", 404);
  const server = getActiveServer(instanceId);
  if (!server?.ipV4 || server.status !== "running") {
    throw new HostAccessError("Der Server ist aus. Starte ihn, um darauf zuzugreifen.", 409);
  }
  return { instance, ip: server.ipV4 };
}

/** Resolves a user-supplied path inside the game data directory; rejects anything outside. */
export function resolveDataPath(relative: string | null | undefined): string {
  const cleaned = path.posix.normalize(`/${relative ?? ""}`).replace(/\/+$/, "");
  const full = `${HOST_DATA}${cleaned === "/" ? "" : cleaned}`;
  if (full !== HOST_DATA && !full.startsWith(`${HOST_DATA}/`)) throw new HostAccessError("Ungültiger Pfad.", 400);
  return full;
}

export function relativeDataPath(full: string): string {
  return full === HOST_DATA ? "" : full.slice(HOST_DATA.length + 1);
}
