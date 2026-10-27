import { parseId, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { HostAccessError, requireRunningHost } from "@/lib/dashboard/host-access";
import { CONTAINER_NAME } from "@/lib/games/runtime";
import { executeRemoteCommand } from "@/lib/orchestrator/ssh";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);

  const lines = Math.min(Math.max(Number(new URL(request.url).searchParams.get("lines") ?? 300), 20), 2000);
  try {
    const { ip } = requireRunningHost(id);
    const res = await executeRemoteCommand(ip, `docker logs --tail ${lines} --timestamps ${CONTAINER_NAME} 2>&1`, {
      timeoutMs: 20_000,
    });
    if (res.code !== 0) return ok({ logs: "", note: "Der Spielserver-Container existiert (noch) nicht." });
    return ok({ logs: res.stdout.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""), note: null });
  } catch (error) {
    if (error instanceof HostAccessError) return fail(error.message, error.status);
    return fail(`Logs nicht abrufbar: ${(error as Error).message}`, 502);
  }
}
