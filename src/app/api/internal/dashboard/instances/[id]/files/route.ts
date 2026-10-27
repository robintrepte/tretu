import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import type { FileEntryWithStats, SFTPWrapper } from "ssh2";

import { parseId, readJson, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import {
  HostAccessError,
  relativeDataPath,
  requireRunningHost,
  resolveDataPath,
} from "@/lib/dashboard/host-access";
import { HOST_DATA } from "@/lib/games/runtime";
import { openRemoteReadStream, runRemote, shq, withSftp, writeRemoteStream } from "@/lib/orchestrator/ssh";

export const dynamic = "force-dynamic";

const MAX_EDIT_BYTES = 2 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

function sftpCall<T>(fn: (cb: (err: Error | null | undefined, result?: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => fn((err, result) => (err ? reject(err) : resolve(result as T))));
}

function errorResponse(error: unknown) {
  if (error instanceof HostAccessError) return fail(error.message, error.status);
  const message = (error as Error).message ?? "Unbekannter Fehler";
  if (/No such file/i.test(message)) return fail("Datei oder Ordner nicht gefunden.", 404);
  return fail(`Dateizugriff fehlgeschlagen: ${message}`, 502);
}

/** Give new files the owner of the data directory so the game (often uid 1000) can use them. */
async function fixOwnership(ip: string, target: string) {
  await runRemote(ip, `chown -R --reference=${HOST_DATA} ${shq(target)}`, "chown").catch(() => undefined);
}

export async function GET(request: Request, { params }: Params) {
  const url = new URL(request.url);
  const op = url.searchParams.get("op") ?? "list";
  const guard = await requirePermission(op === "list" ? "dashboard:view" : "instances:files");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);

  try {
    const { ip } = requireRunningHost(id);
    const target = resolveDataPath(url.searchParams.get("path"));

    if (op === "download") {
      const { stream, size } = await openRemoteReadStream(ip, target);
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(size),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.posix.basename(target))}`,
          "Cache-Control": "no-store",
        },
      });
    }

    return await withSftp(ip, async (sftp: SFTPWrapper) => {
      if (op === "read") {
        const stats = await sftpCall<{ size: number }>((cb) => sftp.stat(target, cb));
        if (stats.size > MAX_EDIT_BYTES) return fail("Datei ist zu groß für den Editor – bitte herunterladen.", 413);
        const content = await sftpCall<Buffer>((cb) => sftp.readFile(target, cb));
        if (content.includes(0)) return fail("Binärdatei – bitte herunterladen statt bearbeiten.", 415);
        return ok({ path: relativeDataPath(target), content: content.toString("utf8") });
      }

      const entries = await sftpCall<FileEntryWithStats[]>((cb) => sftp.readdir(target, cb));
      const items = entries
        .map((e) => ({
          name: e.filename,
          type: e.attrs.isDirectory() ? "dir" : e.attrs.isSymbolicLink() ? "link" : "file",
          size: e.attrs.size,
          modifiedAt: new Date(e.attrs.mtime * 1000).toISOString(),
        }))
        .sort((a, b) => (a.type === "dir") === (b.type === "dir") ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1);
      return ok({ path: relativeDataPath(target), items });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Upload: raw request body, `?path=` is the target file. */
export async function PUT(request: Request, { params }: Params) {
  const guard = await requirePermission("instances:files");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);
  if (!request.body) return fail("Keine Datei übertragen.", 400);

  try {
    const { ip } = requireRunningHost(id);
    const target = resolveDataPath(new URL(request.url).searchParams.get("path"));
    if (target === HOST_DATA) return fail("Ungültiger Dateiname.", 400);
    await runRemote(ip, `mkdir -p ${shq(path.posix.dirname(target))}`, "mkdir");
    await writeRemoteStream(ip, target, Readable.fromWeb(request.body as unknown as WebReadableStream));
    await fixOwnership(ip, target);
    return ok({ path: relativeDataPath(target) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const guard = await requirePermission("instances:files");
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Ungültige ID", 400);
  const body = await readJson(request);

  try {
    const { ip } = requireRunningHost(id);
    const target = resolveDataPath(String(body.path ?? ""));

    switch (body.op) {
      case "write": {
        const content = String(body.content ?? "");
        if (Buffer.byteLength(content) > MAX_EDIT_BYTES) return fail("Inhalt ist zu groß.", 413);
        await withSftp(ip, (sftp) => sftpCall<void>((cb) => sftp.writeFile(target, content, cb)));
        await fixOwnership(ip, target);
        break;
      }
      case "mkdir":
        await runRemote(ip, `mkdir -p ${shq(target)}`, "Ordner anlegen");
        await fixOwnership(ip, target);
        break;
      case "rename": {
        const to = resolveDataPath(String(body.to ?? ""));
        if (target === HOST_DATA || to === HOST_DATA) return fail("Ungültiger Pfad.", 400);
        await runRemote(ip, `mv -n ${shq(target)} ${shq(to)}`, "Umbenennen");
        break;
      }
      case "delete":
        if (target === HOST_DATA) return fail("Der Hauptordner kann nicht gelöscht werden.", 400);
        await runRemote(ip, `rm -rf -- ${shq(target)}`, "Löschen");
        break;
      default:
        return fail("Unbekannte Dateioperation.", 400);
    }
    return ok({ done: true });
  } catch (error) {
    return errorResponse(error);
  }
}
