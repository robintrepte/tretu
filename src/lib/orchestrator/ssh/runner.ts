import fs from "node:fs";

import { Client } from "ssh2";

import { HETZNER_SSH_PRIVATE_KEY_PATH, HETZNER_SSH_USER } from "@/lib/env/server";

type RunOptions = {
  host: string;
  command: string;
  timeoutMs?: number;
};

export async function runSshCommand({
  host,
  command,
  timeoutMs = 30_000,
}: RunOptions): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            reject(err);
            return;
          }

          stream
            .on("close", (code: number) => {
              clearTimeout(timer);
              conn.end();
              if (code === 0) resolve({ stdout, stderr });
              else reject(new Error(`SSH failed with ${code}: ${stderr}`));
            })
            .on("data", (chunk: Buffer) => {
              stdout += chunk.toString();
            });

          stream.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
          });
        });
      })
      .on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      })
      .connect({
        host,
        username: HETZNER_SSH_USER,
        privateKey: HETZNER_SSH_PRIVATE_KEY_PATH
          ? fs.readFileSync(HETZNER_SSH_PRIVATE_KEY_PATH, "utf8")
          : undefined,
      });
  });
}
