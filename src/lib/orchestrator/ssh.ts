import { Client } from "ssh2";
import { existsSync, readFileSync } from "fs";
import { HETZNER_SSH_PRIVATE_KEY_PATH, HETZNER_SSH_USER } from "@/lib/env/server";

export type SSHResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

function loadPrivateKey(): Buffer {
  if (!HETZNER_SSH_PRIVATE_KEY_PATH?.trim()) {
    throw new Error("HETZNER_SSH_PRIVATE_KEY_PATH ist nicht gesetzt.");
  }
  if (!existsSync(HETZNER_SSH_PRIVATE_KEY_PATH)) {
    throw new Error(`SSH-Key-Datei fehlt: ${HETZNER_SSH_PRIVATE_KEY_PATH}`);
  }
  return readFileSync(HETZNER_SSH_PRIVATE_KEY_PATH);
}

export async function executeRemoteCommand(host: string, command: string): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream
            .on("close", (code: number | null) => {
              conn.end();
              resolve({ stdout, stderr, code });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString();
            });
        });
      })
      .on("error", (err) => {
        reject(err);
      })
      .connect({
        host,
        port: 22,
        username: HETZNER_SSH_USER,
        privateKey: loadPrivateKey(),
      });
  });
}

export async function uploadFile(host: string, remotePath: string, content: string): Promise<void> {
  // Simple implementation using base64 to avoid complex SFTP for now
  const base64 = Buffer.from(content).toString("base64");
  const command = `mkdir -p "$(dirname "${remotePath}")" && echo "${base64}" | base64 -d > "${remotePath}"`;
  const res = await executeRemoteCommand(host, command);
  if (res.code !== 0) {
    throw new Error(`Failed to upload file to ${remotePath}: ${res.stderr}`);
  }
}

export function requireRemoteSuccess(res: SSHResult, context: string): void {
  if (res.code !== 0) {
    throw new Error(`${context} (exit ${res.code}): ${res.stderr || res.stdout}`);
  }
}
