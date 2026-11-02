/**
 * Checks of the game servers on tretu.de/status:
 * - Minecraft: Server List Ping (handshake with protocol -1 and next state 1, then a status request), the same
 *   request the game's server list sends. Works with every Minecraft version since 1.7. Up when it answers with
 *   the status JSON (players online / max), down otherwise.
 * - TeamSpeak: ServerQuery (`TS_QUERY_*`, the client of src/lib/teamspeak) → users online; or a plain TCP connect.
 */
import net from "node:net";

import { createTsQueryClient } from "@/lib/platform/teamspeak";
import { CHECK_TIMEOUT_MS, type CheckResult } from "@/lib/status/check";
import type { Address } from "@/lib/status/targets";
import type { TsOnlineClient } from "@/lib/teamspeak/query-client";

/** Largest status answer accepted (the JSON with favicon is usually < 64 KB). */
const MAX_SLP_BYTES = 256 * 1024;

export function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0; // negative numbers as unsigned 32 bit (-1 → ff ff ff ff 0f)
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return Buffer.from(bytes);
}

/** Reads a VarInt at `offset`; null when the buffer ends first. Throws on more than 5 bytes. */
export function readVarInt(buffer: Buffer, offset: number): { value: number; size: number } | null {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return null;
    const byte = buffer[offset + i]!;
    value |= (byte & 0x7f) << (7 * i);
    if (!(byte & 0x80)) return { value, size: i + 1 };
  }
  throw new Error("VarInt too long");
}

function packet(id: number, payload: Buffer): Buffer {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

/** Handshake (protocol -1 = "any", next state 1 = status) followed by the status request. */
export function slpRequest(address: Address): Buffer {
  const host = Buffer.from(address.host, "utf8");
  const port = Buffer.alloc(2);
  port.writeUInt16BE(address.port);
  const handshake = packet(0x00, Buffer.concat([writeVarInt(-1), writeVarInt(host.length), host, port, writeVarInt(1)]));
  return Buffer.concat([handshake, packet(0x00, Buffer.alloc(0))]);
}

/** Parses a complete status response packet; null while incomplete. Throws on a malformed one. */
export function parseSlpResponse(buffer: Buffer): { online: number | null; max: number | null } | null {
  const length = readVarInt(buffer, 0);
  if (!length) return null;
  if (length.value > MAX_SLP_BYTES) throw new Error("response too large");
  if (buffer.length < length.size + length.value) return null;
  const id = readVarInt(buffer, length.size);
  if (!id || id.value !== 0x00) throw new Error("unexpected packet");
  const strLength = readVarInt(buffer, length.size + id.size);
  if (!strLength) throw new Error("truncated");
  const start = length.size + id.size + strLength.size;
  const json: unknown = JSON.parse(buffer.subarray(start, start + strLength.value).toString("utf8"));
  if (!json || typeof json !== "object") throw new Error("no status object");
  const players = (json as { players?: { online?: unknown; max?: unknown } }).players;
  const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  return { online: count(players?.online), max: count(players?.max) };
}

type ConnectOptions = { timeoutMs?: number; signal?: AbortSignal };

/** Opens a TCP connection and runs `talk` on it; resolves with its result or a down result. */
function withSocket(
  address: Address,
  options: ConnectOptions,
  talk: (socket: net.Socket, done: (result: CheckResult) => void, started: number) => void
): Promise<CheckResult> {
  const timeoutMs = options.timeoutMs ?? CHECK_TIMEOUT_MS;
  return new Promise((resolve) => {
    const started = performance.now();
    let finished = false;
    const socket = net.createConnection({ host: address.host, port: address.port });
    const done = (result: CheckResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      socket.destroy();
      resolve(result);
    };
    const down = (error: string): CheckResult => ({ state: "down", responseMs: null, httpStatus: null, error });
    const onAbort = () => done(down("timeout"));
    const timer = setTimeout(onAbort, timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    socket.setNoDelay(true);
    socket.on("error", () => done(down("connection")));
    socket.on("close", () => done(down("connection")));
    socket.on("connect", () => talk(socket, done, started));
  });
}

/** Minecraft Server List Ping. */
export function checkMinecraft(address: Address, options: ConnectOptions = {}): Promise<CheckResult> {
  return withSocket(address, options, (socket, done, started) => {
    let received = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      try {
        const status = parseSlpResponse(received);
        if (!status) return;
        done({
          state: "up",
          responseMs: Math.round(performance.now() - started),
          httpStatus: null,
          error: null,
          usersOnline: status.online,
          usersMax: status.max,
        });
      } catch {
        done({ state: "down", responseMs: Math.round(performance.now() - started), httpStatus: null, error: "invalid_response" });
      }
    });
    socket.write(slpRequest(address));
  });
}

/** Up when a TCP connection can be opened. */
export function checkTcp(address: Address, options: ConnectOptions = {}): Promise<CheckResult> {
  return withSocket(address, options, (_socket, done, started) =>
    done({ state: "up", responseMs: Math.round(performance.now() - started), httpStatus: null, error: null })
  );
}

/** The part of TeamSpeakQueryClient the status check uses (tests pass a stub). */
export type TsStatusClient = {
  connect(retries?: number): Promise<void>;
  clientList(): Promise<TsOnlineClient[]>;
  disconnect(): Promise<void>;
};

/** Users online via ServerQuery (one connection per check, no retries). */
export async function checkTeamspeakQuery(
  options: ConnectOptions & { createClient?: () => TsStatusClient | null } = {}
): Promise<CheckResult> {
  const client = (options.createClient ?? createTsQueryClient)();
  if (!client) return { state: "down", responseMs: null, httpStatus: null, error: "not_configured" };
  const timeoutMs = options.timeoutMs ?? CHECK_TIMEOUT_MS;
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      options.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    });
    timeout.catch(() => undefined); // a late abort after the answer must not become an unhandled rejection
    const clients = await Promise.race([
      (async () => {
        await client.connect(0);
        return client.clientList();
      })(),
      timeout,
    ]);
    return { state: "up", responseMs: Math.round(performance.now() - started), httpStatus: null, error: null, usersOnline: clients.length, usersMax: null };
  } catch (error) {
    return { state: "down", responseMs: null, httpStatus: null, error: error instanceof Error && error.message === "timeout" ? "timeout" : "connection" };
  } finally {
    clearTimeout(timer);
    await client.disconnect().catch(() => undefined);
  }
}
