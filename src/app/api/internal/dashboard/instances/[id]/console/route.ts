import { parseId, readJson, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { HostAccessError, requireRunningHost } from "@/lib/dashboard/host-access";
import { getGameDefinition } from "@/lib/games/catalog";
import { readProfile } from "@/lib/games/profile";
import { consoleShellCommand, networkConsoleCommand } from "@/lib/games/runtime";
import { executeRemoteCommand } from "@/lib/orchestrator/ssh";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("instances:console");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);

  const body = await readJson(request);
  const command = String(body.command ?? "").replace(/^\//, "").trim();
  if (!command || command.length > 500 || /[\r\n]/.test(command)) return fail("Ungültiger Befehl.", 400);

  try {
    const { instance, ip } = requireRunningHost(id);
    if (!getGameDefinition(instance.gameType)?.features.console) return fail("Dieses Spiel hat keine Konsole.", 400);

    db.insert(auditEvents)
      .values({ userId: guard.userId, instanceId: id, eventType: "console.command", metaJson: { command } })
      .run();

    const shell = consoleShellCommand(instance.gameType, command);
    if (shell) {
      const res = await executeRemoteCommand(ip, shell, { timeoutMs: 25_000 });
      if (res.code !== 0) return fail(`Befehl fehlgeschlagen: ${(res.stderr || res.stdout).trim() || "Server noch nicht bereit?"}`, 502);
      return ok({ output: res.stdout.replace(/\x1b\[[0-9;]*[A-Za-z]|§./g, "").trim() });
    }
    const output = await networkConsoleCommand(instance.gameType, ip, readProfile(instance.gameType, instance.configProfile), command);
    return ok({ output });
  } catch (error) {
    if (error instanceof HostAccessError) return fail(error.message, error.status);
    return fail(`Befehl fehlgeschlagen: ${(error as Error).message}`, 502);
  }
}
