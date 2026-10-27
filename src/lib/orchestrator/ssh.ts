import type { Readable, Writable } from "node:stream";

import { Client, type ConnectConfig, type SFTPWrapper } from "ssh2";

import { HETZNER_SSH_USER } from "@/lib/env/server";
import { getSshCredentials } from "@/lib/settings/store";

export type SSHResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

const MAX_OUTPUT = 2 * 1024 * 1024;

function connectConfig(host: string): ConnectConfig {
  const creds = getSshCredentials();
  if (!creds) throw new Error("Kein SSH-Schlüssel vorhanden – bitte die Einrichtung im Dashboard abschließen.");
  return {
    host,
    port: 22,
    username: HETZNER_SSH_USER,
    privateKey: creds.privateKey,
    readyTimeout: 20_000,
    keepaliveInterval: 15_000,
  };
}

function connect(host: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.once("ready", () => resolve(conn)).once("error", reject).connect(connectConfig(host));
  });
}

async function withConnection<T>(host: string, fn: (conn: Client) => Promise<T>): Promise<T> {
  const conn = await connect(host);
  try {
    return await fn(conn);
  } finally {
    conn.end();
  }
}

export type ExecOptions = {
  timeoutMs?: number;
  /** Called with output chunks as they arrive (for job logs). */
  onOutput?: (chunk: string) => void;
};

export async function executeRemoteCommand(host: string, command: string, opts: ExecOptions = {}): Promise<SSHResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return withConnection(
    host,
    (conn) =>
      new Promise<SSHResult>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          conn.end();
          reject(new Error(`SSH-Befehl hat das Zeitlimit (${Math.round(timeoutMs / 1000)}s) überschritten.`));
        }, timeoutMs);

        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            reject(err);
            return;
          }
          stream
            .on("close", (code: number | null) => {
              clearTimeout(timer);
              resolve({ stdout, stderr, code });
            })
            .on("data", (data: Buffer) => {
              const chunk = data.toString();
              if (stdout.length < MAX_OUTPUT) stdout += chunk;
              opts.onOutput?.(chunk);
            });
          stream.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            if (stderr.length < MAX_OUTPUT) stderr += chunk;
            opts.onOutput?.(chunk);
          });
        });
      })
  );
}

export function requireRemoteSuccess(res: SSHResult, context: string): void {
  if (res.code !== 0) {
    const output = (res.stderr || res.stdout).trim().split("\n").slice(-15).join("\n");
    throw new Error(`${context} (Exit-Code ${res.code}): ${output}`);
  }
}

export async function runRemote(host: string, command: string, context: string, opts?: ExecOptions) {
  const res = await executeRemoteCommand(host, command, opts);
  requireRemoteSuccess(res, context);
  return res.stdout;
}

/** Retries the SSH handshake until the freshly booted host accepts connections. */
export async function waitForSsh(host: string, timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await executeRemoteCommand(host, "true", { timeoutMs: 20_000 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  throw new Error(
    `Server ${host} ist per SSH nicht erreichbar: ${lastError instanceof Error ? lastError.message : "unbekannt"}`
  );
}

/** Quote a value for a POSIX shell. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function uploadFile(host: string, remotePath: string, content: string | Buffer, mode = 0o644) {
  await withSftp(host, async (sftp) => {
    await new Promise<void>((resolve, reject) =>
      sftp.writeFile(remotePath, content, { mode }, (err) => (err ? reject(err) : resolve()))
    );
  });
}

export async function withSftp<T>(host: string, fn: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
  return withConnection(
    host,
    (conn) =>
      new Promise<T>((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) {
            reject(err);
            return;
          }
          fn(sftp).then(resolve, reject);
        });
      })
  );
}

/**
 * Opens a read stream for a remote file. The SSH connection closes when the stream ends.
 */
export async function openRemoteReadStream(host: string, remotePath: string): Promise<{ stream: Readable; size: number }> {
  const conn = await connect(host);
  try {
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
      conn.sftp((err, s) => (err ? reject(err) : resolve(s)))
    );
    const stats = await new Promise<{ size: number }>((resolve, reject) =>
      sftp.stat(remotePath, (err, s) => (err ? reject(err) : resolve(s)))
    );
    const stream = sftp.createReadStream(remotePath);
    const close = () => conn.end();
    stream.once("close", close).once("error", close);
    return { stream, size: stats.size };
  } catch (error) {
    conn.end();
    throw error;
  }
}

/** Opens a write stream for a remote file; resolves once the upload is complete. */
export async function writeRemoteStream(host: string, remotePath: string, source: Readable): Promise<void> {
  await withSftp(
    host,
    (sftp) =>
      new Promise<void>((resolve, reject) => {
        const target: Writable = sftp.createWriteStream(remotePath);
        target.once("close", () => resolve()).once("error", reject);
        source.once("error", reject);
        source.pipe(target);
      })
  );
}
