import net from "node:net";

import { formatQueryProbeHelp, probeTeamSpeakQuery } from "@/lib/teamspeak/query-probe";
import { normalizeTsUuid, unescapeTsQueryString } from "@/lib/teamspeak/query-escape";

export type TsQueryClientRow = Record<string, string>;

export type TsOnlineClient = {
  clid: string;
  clientDatabaseId: number;
  uniqueIdentifier: string;
  nickname: string;
  channelId: number;
  /** Milliseconds since last client activity (voice/key). */
  clientIdleTimeMs: number;
};

export type TsQueryConfig = {
  host: string;
  queryPort: number;
  username: string;
  password: string;
  virtualServerPort: number;
  readyTimeoutMs?: number;
};

function parseErrorLine(line: string): TsQueryClientRow {
  const row: TsQueryClientRow = {};
  const rest = line.slice(6).trim();
  for (const token of rest.split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    row[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return row;
}

function parseKeyValueLine(line: string): TsQueryClientRow {
  const row: TsQueryClientRow = {};
  for (const token of line.trim().split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    let value = token.slice(eq + 1);
    if (value.startsWith("{") && value.endsWith("}")) {
      value = value.slice(1, -1);
    }
    row[key] = unescapeTsQueryString(value);
  }
  return row;
}

function parseResponseBlocks(raw: string): { blocks: TsQueryClientRow[]; error: TsQueryClientRow | null } {
  const lines = raw.split("\n").map((l) => l.replace(/\r$/, ""));
  const blocks: TsQueryClientRow[] = [];
  let error: TsQueryClientRow | null = null;
  let current: string[] = [];

  const flush = () => {
    if (!current.length) return;
    const line = current.join(" ").trim();
    current = [];
    if (!line) return;
    const row = parseKeyValueLine(line);
    if ("error id" in row || row["error"] !== undefined || row.id !== undefined) {
      if (row.id !== undefined || row["error"] !== undefined) {
        error = row;
      }
      return;
    }
    if (Object.keys(row).length > 0) {
      blocks.push(row);
    }
  };

  for (const line of lines) {
    if (line.startsWith("error ")) {
      flush();
      error = parseErrorLine(line);
      continue;
    }
    if (line.includes("|")) {
      flush();
      for (const part of line.split("|")) {
        const row = parseKeyValueLine(part);
        if (Object.keys(row).length > 0) blocks.push(row);
      }
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  return { blocks, error };
}

export class TeamSpeakQueryClient {
  private socket: net.Socket | null = null;
  private buffer = "";

  constructor(private readonly config: TsQueryConfig) {}

  async connect(retries = 3): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.connectOnce();
        return;
      } catch (error) {
        lastError = error;
        const retryable = attempt < retries && isTransientConnectError(error);
        if (!retryable) break;
        await sleep(2000 * (attempt + 1));
      }
    }
    throw lastError;
  }

  private async connectOnce(): Promise<void> {
    this.resetSocket();

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.config.host, port: this.config.queryPort },
        () => {
          this.socket = socket;
          resolve();
        }
      );

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("TS query connection timeout"));
      }, this.config.readyTimeoutMs ?? 10_000);

      socket.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.once("connect", () => clearTimeout(timeout));
    });

    await this.waitForBanner();
    await this.execLogin();
    await this.exec("use", { port: String(this.config.virtualServerPort) });
  }

  private async execLogin(): Promise<void> {
    await this.exec("login", {
      client_login_name: this.config.username,
      client_login_password: this.config.password,
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    try {
      if (!this.socket.destroyed) {
        await this.exec("quit");
      }
    } catch {
      // ignore on shutdown
    }
    this.resetSocket();
  }

  async reconnect(): Promise<void> {
    this.resetSocket();
    await this.connect();
  }

  /** Server groups the client is currently assigned to (by database id). */
  async clientServerGroupIds(clientDatabaseId: number): Promise<Set<number>> {
    if (!Number.isFinite(clientDatabaseId) || clientDatabaseId <= 0) {
      return new Set();
    }
    try {
      const { raw } = await this.exec("servergroupsbyclientid", {
        cldbid: String(clientDatabaseId),
      });
      const ids = new Set<number>();
      for (const match of raw.matchAll(/\bsgid=(\d+)/g)) {
        const id = Number(match[1]);
        if (Number.isFinite(id)) ids.add(id);
      }
      return ids;
    } catch (error) {
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      if (
        msg.includes("database client not found") ||
        msg.includes("empty result") ||
        msg.includes("id=1281")
      ) {
        return new Set();
      }
      throw error;
    }
  }

  private resetSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
    }
    this.socket = null;
    this.buffer = "";
  }

  async clientList(): Promise<TsOnlineClient[]> {
    const { blocks } = await this.execCommand("clientlist -uid -times");
    const clients: TsOnlineClient[] = [];

    for (const row of blocks) {
      if (row.client_type !== "0") continue;
      const uniqueIdentifier = normalizeTsUuid(row.client_unique_identifier);
      const nickname = row.client_nickname;
      const clientDatabaseId = Number(row.client_database_id);
      const clid = row.clid;
      const channelId = Number(row.cid ?? 0);
      const clientIdleTimeMs = Number(row.client_idle_time ?? 0);
      if (!uniqueIdentifier || !nickname || !Number.isFinite(clientDatabaseId) || !clid) {
        continue;
      }
      clients.push({
        clid,
        clientDatabaseId,
        uniqueIdentifier,
        nickname,
        channelId: Number.isFinite(channelId) ? channelId : 0,
        clientIdleTimeMs: Number.isFinite(clientIdleTimeMs) ? clientIdleTimeMs : 0,
      });
    }

    return clients;
  }

  async channelList(): Promise<Map<number, string>> {
    const { blocks } = await this.exec("channellist");
    const channels = new Map<number, string>();

    for (const row of blocks) {
      const cid = Number(row.cid);
      const name = row.channel_name;
      if (Number.isFinite(cid) && name) {
        channels.set(cid, name);
      }
    }

    return channels;
  }

  async serverGroupAddClient(serverGroupId: number, clientDatabaseId: number): Promise<void> {
    await this.exec("servergroupaddclient", {
      sgid: String(serverGroupId),
      cldbid: String(clientDatabaseId),
    });
  }

  async serverGroupDelClient(serverGroupId: number, clientDatabaseId: number): Promise<void> {
    await this.exec("servergroupdelclient", {
      sgid: String(serverGroupId),
      cldbid: String(clientDatabaseId),
    });
  }

  private async waitForBanner(): Promise<void> {
    try {
      const banner = await this.readUntil((chunk) => chunk.includes("TS3"));
      if (!banner.includes("TS3")) {
        throw new Error("Invalid TS3 query banner");
      }
    } catch (error) {
      if (isEmptyQueryClose(error)) {
        const probe = await probeTeamSpeakQuery(
          this.config.host,
          this.config.queryPort,
          5_000
        );
        if (!probe.ok && probe.reason === "closed_empty") {
          throw new Error(
            `${probe.detail}\n\n${formatQueryProbeHelp(this.config.host, this.config.queryPort)}`
          );
        }
      }
      throw error;
    }
  }

  /** Run a command line including TS switch flags (e.g. `clientlist -uid -times`). */
  private async execCommand(
    commandLine: string
  ): Promise<{ blocks: TsQueryClientRow[]; error: TsQueryClientRow | null }> {
    return this.execLine(`${commandLine.trim()}\n`);
  }

  private async exec(
    command: string,
    params: Record<string, string> = {}
  ): Promise<{ blocks: TsQueryClientRow[]; error: TsQueryClientRow | null; raw: string }> {
    const paramStr = Object.entries(params)
      .map(([key, value]) => `${key}=${escapeTsQueryValue(value)}`)
      .join(" ");

    const line = paramStr ? `${command} ${paramStr}\n` : `${command}\n`;
    return this.execLine(line);
  }

  private async execLine(
    line: string
  ): Promise<{ blocks: TsQueryClientRow[]; error: TsQueryClientRow | null; raw: string }> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("TS query connection closed");
    }
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(line, (err) => (err ? reject(err) : resolve()));
    });

    const raw = await this.readUntil((chunk) => /error id=\d+/i.test(chunk));
    const parsed = parseResponseBlocks(raw);
    const errorId = Number(parsed.error?.id ?? parsed.error?.["error"] ?? -1);
    if (!Number.isFinite(errorId) || errorId !== 0) {
      const msg = parsed.error?.msg ?? parsed.error?.message ?? "unknown";
      const cmd = line.trim().split(/\s+/)[0] ?? "command";
      throw new Error(`TS query ${cmd} failed: ${msg} (id=${errorId})`);
    }
    return { ...parsed, raw };
  }

  private readUntil(predicate: (buffer: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket) {
        reject(new Error("TS query not connected"));
        return;
      }

      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString("utf8");
        if (predicate(this.buffer)) {
          cleanup();
          const out = this.buffer;
          this.buffer = "";
          resolve(out);
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        const tail = this.buffer.trim().slice(-400);
        const hint = tail ? `: ${tail}` : "";
        reject(new Error(`TS query connection closed${hint}`));
      };

      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("close", onClose);
      };

      if (predicate(this.buffer)) {
        const out = this.buffer;
        this.buffer = "";
        resolve(out);
        return;
      }

      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("close", onClose);
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmptyQueryClose(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("connection closed") && !msg.includes("error id=");
}

function isTransientConnectError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("connection closed") ||
    msg.includes("id=524") ||
    msg.includes("flooding") ||
    msg.includes("connection timeout")
  );
}

function escapeTsQueryValue(value: string): string {
  if (/^[a-zA-Z0-9_\-[\]/.*]+$/.test(value)) return value;
  return `{${value.replace(/\\/g, "\\\\").replace(/}/g, "\\}").replace(/\s/g, "\\s")}}`;
}
