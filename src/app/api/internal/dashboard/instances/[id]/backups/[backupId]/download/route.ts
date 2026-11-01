import { Readable } from "node:stream";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { gameBackups } from "@/db/schema";
import { parseId, requirePermission } from "@/lib/api/guard";

import { failFromError, failKey } from "@/lib/api/errors";
import { requireRunningHost } from "@/lib/dashboard/host-access";
import { HOST_BACKUPS } from "@/lib/games/runtime";
import { openRemoteReadStream } from "@/lib/orchestrator/ssh";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; backupId: string }> }) {
  const guard = await requirePermission("instances:backup");
  if (guard.error) return guard.error;
  const resolved = await params;
  const id = parseId(resolved.id);
  const backupId = parseId(resolved.backupId);
  if (!id || !backupId) return failKey("invalidId", 400);

  const [backup] = await db
    .select()
    .from(gameBackups)
    .where(and(eq(gameBackups.id, backupId), eq(gameBackups.instanceId, id)))
    .limit(1);
  if (!backup) return failKey("backupNotFound", 404);

  try {
    const { instance, ip } = await requireRunningHost(id);
    const { stream, size } = await openRemoteReadStream(ip, `${HOST_BACKUPS}/${backup.fileName}`);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${instance.slug}-${backup.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failFromError(error, { wrapKey: "downloadFailed" });
  }
}
