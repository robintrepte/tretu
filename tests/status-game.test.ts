/** Game-server rows of tretu.de/status: Minecraft Server List Ping against a local stub, TeamSpeak with a stubbed client. */
import assert from "node:assert/strict";
import net, { type AddressInfo } from "node:net";
import test, { after, before } from "node:test";

import { dueWarning, certEndpoints, certMessage } from "../src/lib/status/certs";
import { checkMinecraft, checkTcp, checkTeamspeakQuery, parseSlpResponse, readVarInt, slpRequest, writeVarInt, type TsStatusClient } from "../src/lib/status/game";
import { minecraftTarget, parseAddress, parseStatusTargets, statusTargets, teamspeakTarget } from "../src/lib/status/targets";
import type { TsOnlineClient } from "../src/lib/teamspeak/query-client";

/** Server List Ping stub: decodes the handshake and answers the status request like a Minecraft server. */
type Mode = "answer" | "silent" | "garbage";
let mode: Mode = "answer";
const handshakes: { protocol: number; host: string; port: number; nextState: number }[] = [];
let slp: net.Server;
let slpPort = 0;

function frame(id: number, payload: Buffer): Buffer {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

before(async () => {
  slp = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      // Handshake: [len][0x00][protocol][host][port][next state], then the status request [1][0x00].
      const len = readVarInt(buffer, 0);
      if (!len || buffer.length < len.size + len.value + 2) return;
      let o = len.size;
      const id = readVarInt(buffer, o)!;
      o += id.size;
      const protocol = readVarInt(buffer, o)!;
      o += protocol.size;
      const hostLen = readVarInt(buffer, o)!;
      o += hostLen.size;
      const host = buffer.subarray(o, o + hostLen.value).toString();
      o += hostLen.value;
      const port = buffer.readUInt16BE(o);
      const nextState = readVarInt(buffer, o + 2)!;
      handshakes.push({ protocol: protocol.value, host, port, nextState: nextState.value });
      if (mode === "silent") return;
      if (mode === "garbage") return void socket.end(Buffer.from([0x05, 0x07, 0x01, 0x02, 0x03, 0x04]));
      const json = Buffer.from(JSON.stringify({ version: { name: "1.21.4", protocol: 769 }, players: { online: 7, max: 40 }, description: "Tretu" }));
      const response = frame(0x00, Buffer.concat([writeVarInt(json.length), json]));
      // Split in two writes: the client must wait for the whole packet.
      socket.write(response.subarray(0, 5));
      setTimeout(() => socket.write(response.subarray(5)), 20);
    });
  });
  await new Promise<void>((resolve) => slp.listen(0, "127.0.0.1", resolve));
  slpPort = (slp.address() as AddressInfo).port;
});
after(() => {
  slp.close();
});

test("VarInt encoding (incl. protocol -1) and the handshake bytes", () => {
  assert.deepEqual([...writeVarInt(0)], [0x00]);
  assert.deepEqual([...writeVarInt(300)], [0xac, 0x02]);
  assert.deepEqual([...writeVarInt(-1)], [0xff, 0xff, 0xff, 0xff, 0x0f]);
  assert.deepEqual(readVarInt(Buffer.from([0xac, 0x02]), 0), { value: 300, size: 2 });
  assert.equal(readVarInt(Buffer.from([0xac]), 0), null);
  const request = slpRequest({ host: "mc.tretu.de", port: 25565 });
  assert.equal(request.subarray(-2).toString("hex"), "0100", "status request follows the handshake");
  assert.equal(parseSlpResponse(Buffer.from([0x10, 0x00])), null, "incomplete");
  assert.throws(() => parseSlpResponse(Buffer.from([0x02, 0x01, 0x00])));
});

test("Minecraft: läuft with players online / max, protocol-agnostic handshake", async () => {
  mode = "answer";
  const result = await checkMinecraft({ host: "127.0.0.1", port: slpPort });
  assert.equal(result.state, "up");
  assert.equal(result.usersOnline, 7);
  assert.equal(result.usersMax, 40);
  assert.ok(result.responseMs !== null && result.responseMs >= 0);
  assert.deepEqual(handshakes.at(-1), { protocol: 0xffffffff | 0, host: "127.0.0.1", port: slpPort, nextState: 1 });
});

test("Minecraft: ausgefallen on silence (timeout), garbage and a closed port", async () => {
  mode = "silent";
  const started = Date.now();
  assert.deepEqual(await checkMinecraft({ host: "127.0.0.1", port: slpPort }, { timeoutMs: 300 }), {
    state: "down",
    responseMs: null,
    httpStatus: null,
    error: "timeout",
  });
  assert.ok(Date.now() - started < 3000);
  mode = "garbage";
  const garbage = await checkMinecraft({ host: "127.0.0.1", port: slpPort });
  assert.equal(garbage.state, "down");
  assert.equal(garbage.error, "invalid_response");
  assert.equal((await checkMinecraft({ host: "127.0.0.1", port: 9 })).error, "connection");
});

test("plain TCP check", async () => {
  assert.equal((await checkTcp({ host: "127.0.0.1", port: slpPort })).state, "up");
  assert.equal((await checkTcp({ host: "127.0.0.1", port: 9 })).state, "down");
});

function stubClient(behaviour: "ok" | "fail" | "hang", calls: string[]): () => TsStatusClient {
  return () => ({
    async connect() {
      calls.push("connect");
      if (behaviour === "fail") throw new Error("ECONNREFUSED");
      if (behaviour === "hang") await new Promise(() => {});
    },
    async clientList() {
      calls.push("clientList");
      return [{ clid: "1" }, { clid: "2" }, { clid: "3" }] as TsOnlineClient[];
    },
    async disconnect() {
      calls.push("disconnect");
    },
  });
}

test("TeamSpeak via ServerQuery (stubbed client): users online, down on errors and timeouts, always disconnects", async () => {
  const calls: string[] = [];
  const ok = await checkTeamspeakQuery({ createClient: stubClient("ok", calls) });
  assert.equal(ok.state, "up");
  assert.equal(ok.usersOnline, 3);
  assert.equal(ok.usersMax, null);
  assert.deepEqual(calls, ["connect", "clientList", "disconnect"]);

  const failed = await checkTeamspeakQuery({ createClient: stubClient("fail", []) });
  assert.deepEqual([failed.state, failed.error], ["down", "connection"]);
  const hangCalls: string[] = [];
  const hung = await checkTeamspeakQuery({ createClient: stubClient("hang", hangCalls), timeoutMs: 200 });
  assert.deepEqual([hung.state, hung.error], ["down", "timeout"]);
  assert.equal(hangCalls.at(-1), "disconnect");
  assert.equal((await checkTeamspeakQuery({ createClient: () => null })).error, "not_configured");
});

test("game targets from env: Minecraft default / off / custom, TeamSpeak query / tcp / none", () => {
  assert.deepEqual(parseAddress("mc.tretu.de", 25565), { host: "mc.tretu.de", port: 25565 });
  assert.deepEqual(parseAddress("[::1]:25566", 25565), { host: "::1", port: 25566 });
  assert.equal(parseAddress("mc.tretu.de:99999", 25565), null);
  assert.equal(parseAddress("http://x", 1), null);

  assert.deepEqual(minecraftTarget({}).target, {
    kind: "minecraft",
    id: "minecraft",
    name: "Minecraft-Server",
    host: "mc.tretu.de",
    address: { host: "mc.tretu.de", port: 25565 },
  });
  assert.equal(minecraftTarget({ TRETU_STATUS_MINECRAFT: "off" }).target, null);
  assert.deepEqual(minecraftTarget({ TRETU_STATUS_MINECRAFT: "play.example:25570" }).target?.address, { host: "play.example", port: 25570 });
  assert.ok(minecraftTarget({ TRETU_STATUS_MINECRAFT: "not valid!" }).error);

  assert.equal(teamspeakTarget({}).target, null, "no row without configuration");
  const query = teamspeakTarget({ TS_QUERY_HOST: "127.0.0.1", TS_QUERY_USER: "serveradmin", TS_QUERY_PASSWORD: "x" }).target;
  assert.equal(query?.mode, "query");
  assert.equal(query?.host, "tretu.de");
  const tcp = teamspeakTarget({ TRETU_STATUS_TEAMSPEAK: "ts.example:30033" }).target;
  assert.deepEqual([tcp?.mode, tcp?.host, tcp?.address?.port], ["tcp", "ts.example", 30033]);

  const all = statusTargets({ TRETU_STATUS_TARGETS_JSON: "[]", TRETU_STATUS_TEAMSPEAK: "ts.example:30033" });
  assert.deepEqual(
    all.map((t) => [t.id, t.kind]),
    [
      ["minecraft", "minecraft"],
      ["teamspeak", "teamspeak"],
    ]
  );
});

test("certificate warnings: thresholds 14 and 3 days, once each, German message", () => {
  assert.equal(dueWarning(30, null), null);
  assert.equal(dueWarning(13.5, null), 14);
  assert.equal(dueWarning(13.5, 14), null, "already warned at 14 days");
  assert.equal(dueWarning(2.9, 14), 3);
  assert.equal(dueWarning(2.9, null), 3, "a certificate first seen at 2 days gets one warning, not two");
  assert.equal(dueWarning(1, 3), null);
  assert.equal(dueWarning(-1, 3), null);

  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(
    certMessage("saga.tretu.de", new Date("2026-11-15T12:00:00Z"), now),
    "Das TLS-Zertifikat von **saga.tretu.de** läuft in 13 Tagen ab (15.11.2026). Erneuern: `sudo certbot renew`"
  );
  assert.match(certMessage("x", new Date("2026-11-01T12:00:00Z"), now), /ist abgelaufen \(seit 01\.11\.2026\)/);

  const { targets } = parseStatusTargets(undefined);
  assert.deepEqual(
    certEndpoints(targets, { TRETU_STATUS_CERT_HOSTS: "map.tretu.de, mcp.hollowmere.tretu.de:8443, tretu.de" }).map((a) => `${a.host}:${a.port}`),
    [
      "tretu.de:443",
      "auth.tretu.de:443",
      "saga.tretu.de:443",
      "play.tretu.de:443",
      "hollowmere.tretu.de:443",
      "mc.tretu.de:443",
      "map.tretu.de:443",
      "mcp.hollowmere.tretu.de:8443",
    ]
  );
});
