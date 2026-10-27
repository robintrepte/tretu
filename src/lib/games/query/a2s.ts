import dgram from "node:dgram";

export type A2SInfo = { name: string; map: string; players: number; maxPlayers: number; bots: number };

const A2S_INFO = Buffer.concat([
  Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
  Buffer.from("Source Engine Query\0", "latin1"),
]);

function readCString(buf: Buffer, offset: number): [string, number] {
  const end = buf.indexOf(0, offset);
  const stop = end === -1 ? buf.length : end;
  return [buf.toString("utf8", offset, stop), stop + 1];
}

function parseInfo(buf: Buffer): A2SInfo {
  // 4 bytes header, 1 byte type (0x49), 1 byte protocol
  const [name, afterName] = readCString(buf, 6);
  const [map, afterMap] = readCString(buf, afterName);
  const [, afterFolder] = readCString(buf, afterMap);
  const [, afterGame] = readCString(buf, afterFolder);
  const offset = afterGame + 2; // skip app id
  return { name, map, players: buf[offset], maxPlayers: buf[offset + 1], bots: buf[offset + 2] };
}

/** Steam A2S_INFO query (Source engine servers, incl. the challenge handshake). */
export function queryA2SInfo(host: string, port: number, timeoutMs = 3000): Promise<A2SInfo> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("A2S timeout"));
    }, timeoutMs);

    socket.on("error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.on("message", (msg) => {
      const type = msg[4];
      if (type === 0x41) {
        // S2C_CHALLENGE: resend with the challenge appended.
        socket.send(Buffer.concat([A2S_INFO, msg.subarray(5, 9)]), port, host);
        return;
      }
      if (type === 0x49) {
        clearTimeout(timer);
        socket.close();
        try {
          resolve(parseInfo(msg));
        } catch (error) {
          reject(error);
        }
      }
    });

    socket.send(A2S_INFO, port, host);
  });
}
