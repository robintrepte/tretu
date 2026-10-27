import { splitList, type SettingValues } from "@/lib/games/catalog";
import { isModpackLoader, javaImageTag } from "@/lib/games/minecraft-source";
import type { InstanceProfile } from "@/lib/games/profile";
import { queryA2SInfo } from "@/lib/games/query/a2s";
import { sourceRconCommand } from "@/lib/games/query/rcon";
import { getCurseForgeApiKey } from "@/lib/settings/store";

/** Mount point of the instance volume on the game host. */
export const HOST_ROOT = "/srv/game";
export const HOST_DATA = `${HOST_ROOT}/data`;
export const HOST_BACKUPS = `${HOST_ROOT}/backups`;
export const CONTAINER_NAME = "game";

export type ContainerSpec = {
  image: string;
  env: Record<string, string>;
  args: string[];
  /** `docker run -p` values. */
  ports: string[];
  /** Host paths are relative to HOST_DATA. */
  mounts: Array<{ hostSub: string; container: string }>;
  /** Owner of the data directories (the user the image runs as). */
  uid: number;
  tty: boolean;
  capAdd: string[];
  stopTimeoutSec: number;
};

type RuntimeInput = {
  gameType: string;
  name: string;
  profile: InstanceProfile;
  /** RAM of the Hetzner server type. */
  memoryGb: number;
};

const TZ = "Europe/Berlin";
const bool = (v: unknown) => (v === true || v === "true" ? "true" : "false");
const str = (v: unknown) => String(v ?? "");

function heapGb(memoryGb: number) {
  // Leave room for the OS, Docker and off-heap memory.
  return Math.max(1, memoryGb - (memoryGb <= 8 ? 1.5 : 2.5));
}

function minecraftSpec({ profile, memoryGb }: RuntimeInput): ContainerSpec {
  const s = profile.settings;
  const source = profile.minecraft;
  if (!source) throw new Error("Minecraft-Konfiguration fehlt.");

  const env: Record<string, string> = {
    EULA: "TRUE",
    TZ,
    MEMORY: `${Math.floor(heapGb(memoryGb) * 1024)}M`,
    USE_AIKAR_FLAGS: "true",
    ENABLE_RCON: "true",
    STOP_DURATION: "60",
    MOTD: str(s.motd),
    MAX_PLAYERS: str(s.maxPlayers),
    DIFFICULTY: str(s.difficulty),
    MODE: str(s.gamemode),
    PVP: bool(s.pvp),
    ONLINE_MODE: bool(s.onlineMode),
    ENABLE_WHITELIST: bool(s.whitelistEnabled),
    VIEW_DISTANCE: str(s.viewDistance),
    SIMULATION_DISTANCE: str(s.simulationDistance),
    ALLOW_FLIGHT: bool(s.allowFlight),
    ENABLE_COMMAND_BLOCK: bool(s.commandBlocks),
    SPAWN_PROTECTION: str(s.spawnProtection),
  };
  // itzg generates a random RCON password when none is set; rcon-cli inside the container picks it up.
  if (profile.secrets.rconPassword) env.RCON_PASSWORD = profile.secrets.rconPassword;
  if (str(s.seed)) env.SEED = str(s.seed);
  const whitelist = splitList(s.whitelist);
  if (whitelist.length) env.WHITELIST = whitelist.join(",");
  const ops = splitList(s.ops);
  if (ops.length) env.OPS = ops.join(",");

  switch (source.loader) {
    case "modrinth":
      env.TYPE = "MODRINTH";
      env.MODRINTH_MODPACK = source.modpack?.slug || source.modpack?.projectId || "";
      env.MODRINTH_VERSION = source.modpack?.versionId ?? "";
      break;
    case "curseforge": {
      const apiKey = getCurseForgeApiKey();
      if (!apiKey) throw new Error("Für CurseForge-Modpacks fehlt der CurseForge-API-Key (Einrichtung).");
      env.TYPE = "AUTO_CURSEFORGE";
      env.CF_API_KEY = apiKey;
      if (!source.modpack?.slug || /^\d+$/.test(source.modpack.slug)) {
        throw new Error("CurseForge-Modpack bitte in den Einstellungen neu auswählen.");
      }
      env.CF_SLUG = source.modpack.slug;
      env.CF_FILE_ID = source.modpack?.versionId ?? "";
      break;
    }
    default:
      env.TYPE = source.loader.toUpperCase();
      env.VERSION = source.version || "LATEST";
  }
  if (source.extraProjects.length && source.loader !== "vanilla") {
    env.MODRINTH_PROJECTS = source.extraProjects.map((p) => p.slug || p.projectId).join(",");
    env.MODRINTH_DOWNLOAD_DEPENDENCIES = "required";
  }

  const javaVersion = isModpackLoader(source.loader) ? source.version || "1.21" : source.version;
  return {
    image: `itzg/minecraft-server:${javaImageTag(javaVersion)}`,
    env,
    args: [],
    ports: ["25565:25565/tcp"],
    mounts: [{ hostSub: "", container: "/data" }],
    uid: 1000,
    tty: false,
    capAdd: [],
    stopTimeoutSec: 90,
  };
}

function valheimSpec({ profile }: RuntimeInput): ContainerSpec {
  const s = profile.settings;
  const args: string[] = [];
  if (s.crossplay === true) args.push("-crossplay");
  if (s.preset && s.preset !== "normal") args.push(`-preset ${str(s.preset)}`);
  return {
    image: "lloesche/valheim-server:latest",
    env: {
      TZ,
      SERVER_NAME: str(s.serverName),
      WORLD_NAME: str(s.worldName),
      SERVER_PASS: str(s.password),
      SERVER_PUBLIC: bool(s.public),
      SERVER_ARGS: args.join(" "),
      STATUS_HTTP: "true",
      STATUS_HTTP_PORT: "9080",
      BACKUPS: "false",
    },
    args: [],
    ports: ["2456-2457:2456-2457/udp", "127.0.0.1:9080:9080/tcp"],
    mounts: [
      { hostSub: "config", container: "/config" },
      { hostSub: "server", container: "/opt/valheim" },
    ],
    uid: 0,
    tty: false,
    capAdd: ["SYS_NICE"],
    stopTimeoutSec: 120,
  };
}

function satisfactorySpec({ profile }: RuntimeInput): ContainerSpec {
  const s = profile.settings;
  return {
    image: "wolveix/satisfactory-server:latest",
    env: {
      TZ,
      MAXPLAYERS: str(s.maxPlayers),
      PUID: "1000",
      PGID: "1000",
      STEAMBETA: bool(s.experimental),
    },
    args: [],
    ports: ["7777:7777/udp", "7777:7777/tcp", "8888:8888/tcp"],
    mounts: [{ hostSub: "", container: "/config" }],
    uid: 1000,
    tty: false,
    capAdd: [],
    stopTimeoutSec: 120,
  };
}

function palworldSpec({ profile }: RuntimeInput): ContainerSpec {
  const s = profile.settings;
  return {
    image: "thijsvanloef/palworld-server-docker:latest",
    env: {
      TZ,
      PUID: "1000",
      PGID: "1000",
      PORT: "8211",
      PLAYERS: str(s.maxPlayers),
      MULTITHREADING: "true",
      SERVER_NAME: str(s.serverName),
      SERVER_DESCRIPTION: str(s.description),
      SERVER_PASSWORD: str(s.password),
      ADMIN_PASSWORD: str(s.adminPassword),
      COMMUNITY: bool(s.community),
      RCON_ENABLED: "false",
      REST_API_ENABLED: "true",
      REST_API_PORT: "8212",
      BACKUP_ENABLED: "false",
    },
    args: [],
    ports: ["8211:8211/udp", "27015:27015/udp", "127.0.0.1:8212:8212/tcp"],
    mounts: [{ hostSub: "", container: "/palworld" }],
    uid: 1000,
    tty: false,
    capAdd: [],
    stopTimeoutSec: 120,
  };
}

function terrariaWorldName(settings: SettingValues) {
  return str(settings.worldName).replace(/[^A-Za-z0-9_-]/g, "") || "tretu";
}

function terrariaSpec({ profile }: RuntimeInput): ContainerSpec {
  const s = profile.settings;
  const worlds = "/root/.local/share/Terraria/Worlds";
  const args = [
    "-port",
    "7777",
    "-world",
    `${worlds}/${terrariaWorldName(s)}.wld`,
    "-autocreate",
    str(s.worldSize || "2"),
    "-maxplayers",
    str(s.maxPlayers),
  ];
  if (str(s.password)) args.push("-pass", str(s.password));
  return {
    image: "ryshe/terraria:latest",
    env: { TZ },
    args,
    ports: ["7777:7777/tcp"],
    mounts: [
      { hostSub: "worlds", container: worlds },
      { hostSub: "logs", container: "/tshock/logs" },
      { hostSub: "plugins", container: "/plugins" },
    ],
    uid: 0,
    tty: true,
    capAdd: [],
    stopTimeoutSec: 60,
  };
}

function cs2Spec({ profile }: RuntimeInput): ContainerSpec {
  const s = profile.settings;
  return {
    image: "joedwards32/cs2:latest",
    env: {
      TZ,
      SRCDS_TOKEN: str(s.gslt),
      CS2_SERVERNAME: str(s.serverName),
      CS2_PW: str(s.password),
      CS2_RCONPW: str(s.rconPassword),
      CS2_MAXPLAYERS: str(s.maxPlayers),
      CS2_GAMEALIAS: str(s.gameMode),
      CS2_STARTMAP: str(s.startMap),
      CS2_PORT: "27015",
      CS2_LAN: "0",
    },
    args: [],
    ports: ["27015:27015/tcp", "27015:27015/udp", "27020:27020/udp"],
    mounts: [{ hostSub: "", container: "/home/steam/cs2-dedicated" }],
    uid: 1000,
    tty: false,
    capAdd: [],
    stopTimeoutSec: 60,
  };
}

const SPECS: Record<string, (input: RuntimeInput) => ContainerSpec> = {
  minecraft: minecraftSpec,
  valheim: valheimSpec,
  satisfactory: satisfactorySpec,
  palworld: palworldSpec,
  terraria: terrariaSpec,
  cs2: cs2Spec,
};

export function buildContainerSpec(input: RuntimeInput): ContainerSpec {
  const build = SPECS[input.gameType];
  if (!build) throw new Error(`Spiel „${input.gameType}“ wird nicht (mehr) unterstützt.`);
  return build(input);
}

function envFile(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${v.replace(/[\r\n]/g, " ")}`)
      .join("\n") + "\n"
  );
}

function shellWord(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Files written to the host: env file + run script that (re)creates the container. */
export function renderRuntimeFiles(spec: ContainerSpec): { env: string; script: string } {
  const dirs = spec.mounts.map((m) => (m.hostSub ? `${HOST_DATA}/${m.hostSub}` : HOST_DATA));
  const runArgs = [
    "docker run -d",
    `--name ${CONTAINER_NAME}`,
    "--restart unless-stopped",
    `--env-file ${HOST_ROOT}/game.env`,
    "--log-opt max-size=20m --log-opt max-file=3",
    `--stop-timeout ${spec.stopTimeoutSec}`,
    spec.tty ? "-it" : "",
    ...spec.capAdd.map((c) => `--cap-add ${c}`),
    ...spec.ports.map((p) => `-p ${p}`),
    ...spec.mounts.map((m) => `-v ${m.hostSub ? `${HOST_DATA}/${m.hostSub}` : HOST_DATA}:${m.container}`),
    shellWord(spec.image),
    ...spec.args.map(shellWord),
  ].filter(Boolean);

  const script = [
    "#!/bin/bash",
    "# Generated by the tretu dashboard – changes are overwritten on the next start.",
    "set -euo pipefail",
    `mkdir -p ${dirs.join(" ")}`,
    // Files uploaded via SFTP belong to root; images that run as uid 1000 need to own them.
    spec.uid !== 0 ? `find ${HOST_DATA} -xdev \\! -user ${spec.uid} -exec chown ${spec.uid}:${spec.uid} {} +` : "",
    `docker rm -f ${CONTAINER_NAME} >/dev/null 2>&1 || true`,
    runArgs.join(" \\\n  "),
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { env: envFile(spec.env), script: `${script}\n` };
}

/**
 * Paths (relative to HOST_DATA) that hold the save data. Game binaries are left out because
 * they are downloaded again on start (CS2 alone is ~60 GB). Empty = everything.
 */
export function backupPaths(gameType: string): string[] {
  switch (gameType) {
    case "valheim":
      return ["config"];
    case "satisfactory":
      return ["saved"];
    case "palworld":
      return ["Pal/Saved"];
    case "terraria":
      return ["worlds", "plugins"];
    case "cs2":
      return ["game/csgo/cfg"];
    default:
      return [];
  }
}

export type ProbeResult = {
  container: "running" | "restarting" | "exited" | "created" | "missing" | string;
  health: string | null;
  startedAt: string | null;
  players: number | null;
  maxPlayers: number | null;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
};

/** Shell snippet run on the host; prints `KEY value` lines parsed by `parseProbe`. */
export function probeScript(gameType: string, profile: InstanceProfile): string {
  const lines = [
    `S=$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.StartedAt}}' ${CONTAINER_NAME} 2>/dev/null || echo 'missing||')`,
    'echo "STATE $S"',
    `echo "DISK $(df -B1 --output=size,used ${HOST_ROOT} 2>/dev/null | tail -1)"`,
  ];
  if (gameType === "minecraft") {
    lines.push(`echo "MC $(timeout 8 docker exec ${CONTAINER_NAME} rcon-cli list 2>/dev/null | head -1)"`);
  } else if (gameType === "valheim") {
    lines.push('echo "VALHEIM $(curl -fsS -m 5 http://127.0.0.1:9080/status.json 2>/dev/null | tr -d \'\\n\')"');
  } else if (gameType === "palworld") {
    const pw = shellWord(`admin:${str(profile.settings.adminPassword)}`);
    lines.push(
      `echo "PALWORLD $(curl -fsS -m 5 -u ${pw} http://127.0.0.1:8212/v1/api/players 2>/dev/null | tr -d '\\n')"`
    );
  }
  return lines.join("\n");
}

export function parseProbe(gameType: string, profile: InstanceProfile, stdout: string): ProbeResult {
  const result: ProbeResult = {
    container: "missing",
    health: null,
    startedAt: null,
    players: null,
    maxPlayers: null,
    diskTotalBytes: null,
    diskUsedBytes: null,
  };
  for (const line of stdout.split("\n")) {
    const [tag, ...rest] = line.split(" ");
    const value = rest.join(" ").trim();
    if (tag === "STATE") {
      const [status, health, startedAt] = value.split("|");
      result.container = status || "missing";
      result.health = health || null;
      result.startedAt = startedAt || null;
    } else if (tag === "DISK") {
      const [size, used] = value.split(/\s+/).map(Number);
      if (Number.isFinite(size) && Number.isFinite(used)) {
        result.diskTotalBytes = size;
        result.diskUsedBytes = used;
      }
    } else if (tag === "MC" && gameType === "minecraft") {
      const m = /(\d+)\s+of a max of\s+(\d+)/i.exec(value) ?? /(\d+)\s*\/\s*(\d+)/.exec(value);
      if (m) {
        result.players = Number(m[1]);
        result.maxPlayers = Number(m[2]);
      }
    } else if (tag === "VALHEIM" && gameType === "valheim" && value) {
      try {
        const json = JSON.parse(value) as { player_count?: number; error?: string | null };
        if (typeof json.player_count === "number" && !json.error) {
          result.players = json.player_count;
          result.maxPlayers = 10;
        }
      } catch {
        // server still starting
      }
    } else if (tag === "PALWORLD" && gameType === "palworld" && value) {
      try {
        const json = JSON.parse(value) as { players?: unknown[] };
        if (Array.isArray(json.players)) {
          result.players = json.players.length;
          result.maxPlayers = Number(profile.settings.maxPlayers) || null;
        }
      } catch {
        // server still starting
      }
    }
  }
  return result;
}

/** Network-side player query for games that answer Steam A2S (CS2). */
export async function networkPlayerQuery(gameType: string, ip: string) {
  if (gameType !== "cs2") return null;
  try {
    const info = await queryA2SInfo(ip, 27015);
    return { players: info.players - info.bots, maxPlayers: info.maxPlayers };
  } catch {
    return null;
  }
}

/** Shell command for the console (run on the host), or null when the game uses network RCON. */
export function consoleShellCommand(gameType: string, command: string): string | null {
  if (gameType === "minecraft") return `timeout 20 docker exec ${CONTAINER_NAME} rcon-cli ${shellWord(command)}`;
  return null;
}

export async function networkConsoleCommand(gameType: string, ip: string, profile: InstanceProfile, command: string) {
  if (gameType !== "cs2") throw new Error("Für dieses Spiel gibt es keine Konsole.");
  const password = str(profile.settings.rconPassword);
  if (!password) throw new Error("Kein RCON-Passwort gesetzt.");
  return sourceRconCommand(ip, 27015, password, command);
}
