import net from "node:net";

export type QueryProbeResult =
  | { ok: true; banner: string }
  | { ok: false; reason: "timeout" | "refused" | "closed_empty" | "error"; detail: string };

/** Low-level check before login — detects remote Query blocks (empty close, no TS3 banner). */
export function probeTeamSpeakQuery(
  host: string,
  port: number,
  timeoutMs = 8_000
): Promise<QueryProbeResult> {
  return new Promise((resolve) => {
    let buf = "";
    let settled = false;

    const finish = (result: QueryProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const socket = net.createConnection({ host, port });

    const timer = setTimeout(() => {
      finish({
        ok: false,
        reason: "timeout",
        detail: `No TS3 banner within ${timeoutMs}ms (host=${host}:${port})`,
      });
    }, timeoutMs);

    socket.on("connect", () => {
      // TS sends banner immediately after connect when Query is allowed.
    });

    socket.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      if (buf.includes("TS3")) {
        finish({ ok: true, banner: buf.trim().slice(0, 300) });
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      const refused = err.code === "ECONNREFUSED" || err.code === "EHOSTUNREACH";
      finish({
        ok: false,
        reason: refused ? "refused" : "error",
        detail: err.message,
      });
    });

    socket.on("close", () => {
      if (buf.includes("TS3")) return;
      finish({
        ok: false,
        reason: "closed_empty",
        detail:
          "TCP connected but server sent no TS3 banner and closed. " +
          "Usually query is localhost-only (query_allow_foreign_ips=0), IP not whitelisted, " +
          "or a flood ban. Run worker/resync on the TS host (TS_QUERY_HOST=127.0.0.1) or use an SSH tunnel.",
      });
    });
  });
}

export function formatQueryProbeHelp(host: string, port: number): string {
  return [
    "TeamSpeak ServerQuery is not reachable from this machine.",
    "",
    "Fix options:",
    `  1) On the TS server (${host}): run resync/worker there with TS_QUERY_HOST=127.0.0.1`,
    "  2) In ts3server.ini set query_allow_foreign_ips=1 (and restart TS), or whitelist your IP",
    `  3) SSH tunnel: ssh -L ${port}:127.0.0.1:${port} user@${host}`,
    "     then set TS_QUERY_HOST=127.0.0.1 in .env.local",
  ].join("\n");
}
