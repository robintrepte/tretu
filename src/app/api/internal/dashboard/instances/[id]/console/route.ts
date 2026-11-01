import { parseId, readJson, requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { failFromError, failKey } from "@/lib/api/errors";
import { requireRunningHost } from "@/lib/dashboard/host-access";
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
  if (!id) return failKey("invalidId", 400);

  const body = await readJson(request);
  const command = String(body.command ?? "").replace(/^\//, "").trim();
  if (!command || command.length > 500 || /[\r\n]/.test(command)) return failKey("invalidCommand", 400);

  try {
    const { instance, ip } = await requireRunningHost(id);
    if (!getGameDefinition(instance.gameType)?.features.console) return failKey("noConsole", 400);

    await db
      .insert(auditEvents)
      .values({ userId: guard.userId, instanceId: id, eventType: "console.command", metaJson: { command } });

    const shell = consoleShellCommand(instance.gameType, command);
    if (shell) {
      const res = await executeRemoteCommand(ip, shell, { timeoutMs: 25_000 });
      if (res.code !== 0) {
        const detail = (res.stderr || res.stdout).trim();
        return detail ? failKey("commandFailed", 502, { detail }) : failKey("commandNotReady", 502);
      }
      return ok({ output: res.stdout.replace(/\x1b\[[0-9;]*[A-Za-z]|§./g, "").trim() });
    }
    const output = await networkConsoleCommand(instance.gameType, ip, readProfile(instance.gameType, instance.configProfile), command);
    return ok({ output });
  } catch (error) {
    return failFromError(error, { wrapKey: "commandFailed" });
  }
}
