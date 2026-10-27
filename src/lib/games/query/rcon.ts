import net from "node:net";

const SERVERDATA_AUTH = 3;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH_RESPONSE = 2;

function packet(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  buf.writeInt16LE(0, 12 + payload.length);
  return buf;
}

/** Runs one command over the Source RCON protocol (CS2) and returns the response text. */
export function sourceRconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 5000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let authed = false;
    let output = "";
    let settleTimer: NodeJS.Timeout | null = null;

    const finish = (error?: Error) => {
      clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve(output.trim());
    };

    const timer = setTimeout(() => (authed ? finish() : finish(new Error("RCON timeout"))), timeoutMs);

    socket.on("connect", () => socket.write(packet(1, SERVERDATA_AUTH, password)));
    socket.on("error", (err) => finish(err));
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) break;
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.toString("utf8", 12, 4 + size - 2);
        buffer = buffer.subarray(size + 4);

        if (!authed) {
          if (type !== SERVERDATA_AUTH_RESPONSE) continue;
          if (id === -1) return finish(new Error("RCON-Passwort falsch"));
          authed = true;
          socket.write(packet(2, SERVERDATA_EXECCOMMAND, command));
          continue;
        }
        if (id === 2) {
          output += body;
          // Responses may be split; wait briefly for more packets.
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(), 300);
        }
      }
    });
  });
}
