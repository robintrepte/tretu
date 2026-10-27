/**
 * Client-safe catalog of the games the dashboard can host. Each game runs as one Docker
 * container on its own Hetzner VM; the runtime details live in `@/lib/games/runtime`.
 */

type BaseField = { key: string; label: string; help?: string };

export type SettingField = BaseField &
  (
    | { type: "text"; default: string; placeholder?: string; required?: boolean; maxLength?: number }
    | {
        type: "password";
        default: string;
        required?: boolean;
        minLength?: number;
        /** Generate a random value when left empty. */
        generate?: boolean;
      }
    | { type: "number"; default: number; min: number; max: number }
    | { type: "boolean"; default: boolean }
    | { type: "select"; default: string; options: Array<{ value: string; label: string }> }
    /** Comma/newline separated list (e.g. player names). */
    | { type: "list"; default: string; placeholder?: string }
  );

export type SettingValues = Record<string, string | number | boolean>;

export type GamePort = { port: string; protocol: "tcp" | "udp"; label: string };

export type GameDefinition = {
  id: string;
  label: string;
  tagline: string;
  ports: GamePort[];
  /** Port players connect to (omitted from the address when it is the game's default). */
  connectPort: number;
  showPortInAddress: boolean;
  minRamGb: number;
  recommendedRamGb: number;
  defaultVolumeGb: number;
  minVolumeGb: number;
  /**
   * Whether new servers of this game can be created. Games whose Docker setup has not been
   * verified on a real server yet are shown greyed out in the dashboard.
   */
  available: boolean;
  features: {
    /** Send commands from the dashboard console. */
    console: boolean;
    /** Online players can be queried (required for the idle shutdown). */
    playerCount: boolean;
  };
  settings: SettingField[];
  connectHint: string;
  notes?: string[];
};

export const GAME_CATALOG: GameDefinition[] = [
  {
    id: "minecraft",
    label: "Minecraft (Java)",
    tagline: "Vanilla, Paper, Purpur, Fabric, Forge, NeoForge oder komplette Modpacks von Modrinth & CurseForge.",
    ports: [{ port: "25565", protocol: "tcp", label: "Spiel" }],
    connectPort: 25565,
    showPortInAddress: false,
    minRamGb: 4,
    recommendedRamGb: 8,
    defaultVolumeGb: 20,
    minVolumeGb: 10,
    available: true,
    features: { console: true, playerCount: true },
    connectHint: "Minecraft → Multiplayer → Server hinzufügen → Adresse einfügen.",
    notes: ["Größere Modpacks brauchen 12–16 GB RAM und beim ersten Start 5–10 Minuten."],
    settings: [
      { key: "motd", label: "Server-Beschreibung (MOTD)", type: "text", default: "Ein Tretu-Server", maxLength: 120 },
      { key: "maxPlayers", label: "Max. Spieler", type: "number", default: 20, min: 1, max: 200 },
      {
        key: "difficulty",
        label: "Schwierigkeit",
        type: "select",
        default: "normal",
        options: [
          { value: "peaceful", label: "Friedlich" },
          { value: "easy", label: "Einfach" },
          { value: "normal", label: "Normal" },
          { value: "hard", label: "Schwer" },
        ],
      },
      {
        key: "gamemode",
        label: "Spielmodus",
        type: "select",
        default: "survival",
        options: [
          { value: "survival", label: "Überleben" },
          { value: "creative", label: "Kreativ" },
          { value: "adventure", label: "Abenteuer" },
          { value: "spectator", label: "Zuschauer" },
        ],
      },
      { key: "pvp", label: "PvP erlaubt", type: "boolean", default: true },
      {
        key: "onlineMode",
        label: "Nur Original-Accounts (Online-Modus)",
        type: "boolean",
        default: true,
        help: "Aus nur, wenn ihr bewusst Cracked-Clients zulassen wollt.",
      },
      { key: "whitelistEnabled", label: "Whitelist aktiv", type: "boolean", default: false },
      { key: "whitelist", label: "Whitelist (Spielernamen)", type: "list", default: "", placeholder: "Steve, Alex" },
      {
        key: "ops",
        label: "Operatoren / Admins (Spielernamen)",
        type: "list",
        default: "",
        placeholder: "Steve",
      },
      { key: "viewDistance", label: "Sichtweite (Chunks)", type: "number", default: 10, min: 3, max: 32 },
      { key: "simulationDistance", label: "Simulationsdistanz (Chunks)", type: "number", default: 10, min: 3, max: 32 },
      { key: "seed", label: "Welt-Seed (leer = zufällig)", type: "text", default: "", maxLength: 64 },
      {
        key: "allowFlight",
        label: "Fliegen erlauben",
        type: "boolean",
        default: false,
        help: "Bei vielen Modpacks nötig, sonst kicken Jetpacks & Co.",
      },
      { key: "commandBlocks", label: "Befehlsblöcke aktiv", type: "boolean", default: false },
      { key: "spawnProtection", label: "Spawn-Schutz (Blöcke)", type: "number", default: 16, min: 0, max: 128 },
    ],
  },
  {
    id: "valheim",
    label: "Valheim",
    tagline: "Dedizierter Server mit Weltpresets und optionalem Crossplay.",
    ports: [{ port: "2456-2457", protocol: "udp", label: "Spiel" }],
    connectPort: 2456,
    showPortInAddress: true,
    minRamGb: 4,
    recommendedRamGb: 8,
    defaultVolumeGb: 20,
    minVolumeGb: 10,
    available: false,
    features: { console: false, playerCount: true },
    connectHint: "Valheim → Spiel beitreten → IP hinzufügen → Adresse mit Port eingeben.",
    settings: [
      { key: "serverName", label: "Servername", type: "text", default: "Tretu Valheim", required: true, maxLength: 64 },
      { key: "worldName", label: "Weltname", type: "text", default: "Tretu", required: true, maxLength: 32 },
      {
        key: "password",
        label: "Passwort",
        type: "password",
        default: "",
        required: true,
        minLength: 5,
        help: "Mindestens 5 Zeichen, darf nicht im Servernamen vorkommen.",
      },
      { key: "public", label: "In der öffentlichen Serverliste anzeigen", type: "boolean", default: false },
      { key: "crossplay", label: "Crossplay (Xbox / Game Pass)", type: "boolean", default: false },
      {
        key: "preset",
        label: "Welt-Preset",
        type: "select",
        default: "normal",
        options: [
          { value: "normal", label: "Normal" },
          { value: "casual", label: "Entspannt" },
          { value: "easy", label: "Einfach" },
          { value: "hard", label: "Schwer" },
          { value: "hardcore", label: "Hardcore" },
          { value: "immersive", label: "Immersiv" },
          { value: "hammer", label: "Hammer (Bauen ohne Kosten)" },
        ],
      },
    ],
  },
  {
    id: "satisfactory",
    label: "Satisfactory",
    tagline: "Fabrik-Server, Verwaltung von Name & Admin-Passwort im Spiel.",
    ports: [
      { port: "7777", protocol: "udp", label: "Spiel" },
      { port: "7777", protocol: "tcp", label: "API" },
      { port: "8888", protocol: "tcp", label: "Messaging" },
    ],
    connectPort: 7777,
    showPortInAddress: true,
    minRamGb: 8,
    recommendedRamGb: 16,
    defaultVolumeGb: 30,
    minVolumeGb: 20,
    available: false,
    features: { console: false, playerCount: false },
    connectHint: "Satisfactory → Server Manager → Server hinzufügen → Adresse + Port 7777. Beim ersten Verbinden Name und Admin-Passwort festlegen.",
    notes: ["Satisfactory meldet keine Spielerzahl – die automatische Abschaltung im Leerlauf ist hier nicht möglich."],
    settings: [
      { key: "maxPlayers", label: "Max. Spieler", type: "number", default: 4, min: 1, max: 16 },
      { key: "experimental", label: "Experimental-Branch", type: "boolean", default: false },
    ],
  },
  {
    id: "palworld",
    label: "Palworld",
    tagline: "Dedizierter Palworld-Server mit Passwortschutz.",
    ports: [
      { port: "8211", protocol: "udp", label: "Spiel" },
      { port: "27015", protocol: "udp", label: "Query" },
    ],
    connectPort: 8211,
    showPortInAddress: true,
    minRamGb: 8,
    recommendedRamGb: 16,
    defaultVolumeGb: 30,
    minVolumeGb: 20,
    available: false,
    features: { console: false, playerCount: true },
    connectHint: "Palworld → Mehrspieler beitreten → unten Adresse mit Port eingeben.",
    settings: [
      { key: "serverName", label: "Servername", type: "text", default: "Tretu Palworld", required: true, maxLength: 64 },
      { key: "description", label: "Beschreibung", type: "text", default: "", maxLength: 120 },
      { key: "password", label: "Server-Passwort (optional)", type: "password", default: "" },
      {
        key: "adminPassword",
        label: "Admin-Passwort",
        type: "password",
        default: "",
        generate: true,
        help: "Leer lassen = wird automatisch erzeugt.",
      },
      { key: "maxPlayers", label: "Max. Spieler", type: "number", default: 16, min: 1, max: 32 },
      { key: "community", label: "In der Community-Serverliste anzeigen", type: "boolean", default: false },
    ],
  },
  {
    id: "terraria",
    label: "Terraria",
    tagline: "TShock-Server, Welt wird beim ersten Start automatisch erstellt.",
    ports: [{ port: "7777", protocol: "tcp", label: "Spiel" }],
    connectPort: 7777,
    showPortInAddress: true,
    minRamGb: 2,
    recommendedRamGb: 4,
    defaultVolumeGb: 10,
    minVolumeGb: 10,
    available: false,
    features: { console: false, playerCount: false },
    connectHint: "Terraria → Mehrspieler → Über IP beitreten → Adresse und Port 7777.",
    notes: ["Terraria meldet keine Spielerzahl – die automatische Abschaltung im Leerlauf ist hier nicht möglich."],
    settings: [
      { key: "worldName", label: "Weltname", type: "text", default: "tretu", required: true, maxLength: 32 },
      {
        key: "worldSize",
        label: "Weltgröße (nur beim Erstellen)",
        type: "select",
        default: "2",
        options: [
          { value: "1", label: "Klein" },
          { value: "2", label: "Mittel" },
          { value: "3", label: "Groß" },
        ],
      },
      { key: "maxPlayers", label: "Max. Spieler", type: "number", default: 8, min: 1, max: 255 },
      { key: "password", label: "Passwort (optional)", type: "password", default: "" },
    ],
  },
  {
    id: "cs2",
    label: "Counter-Strike 2",
    tagline: "Dedizierter CS2-Server inklusive RCON-Konsole.",
    ports: [
      { port: "27015", protocol: "tcp", label: "RCON" },
      { port: "27015", protocol: "udp", label: "Spiel" },
      { port: "27020", protocol: "udp", label: "CSTV" },
    ],
    connectPort: 27015,
    showPortInAddress: true,
    minRamGb: 4,
    recommendedRamGb: 8,
    defaultVolumeGb: 80,
    minVolumeGb: 60,
    available: false,
    features: { console: true, playerCount: true },
    connectHint: "CS2 → Konsole (~) → connect <Adresse>; password <Passwort>.",
    notes: ["Der erste Start lädt ca. 60 GB von Steam und dauert 10–20 Minuten."],
    settings: [
      { key: "serverName", label: "Servername", type: "text", default: "Tretu CS2", required: true, maxLength: 64 },
      {
        key: "gslt",
        label: "Steam Game Server Login Token (GSLT)",
        type: "password",
        default: "",
        help: "Für Verbindungen aus dem Internet nötig. Erstellen unter steamcommunity.com/dev/managegameservers (App-ID 730).",
      },
      { key: "password", label: "Server-Passwort (optional)", type: "password", default: "" },
      {
        key: "rconPassword",
        label: "RCON-Passwort",
        type: "password",
        default: "",
        generate: true,
        help: "Leer lassen = wird automatisch erzeugt. Wird für die Dashboard-Konsole genutzt.",
      },
      { key: "maxPlayers", label: "Max. Spieler", type: "number", default: 10, min: 2, max: 64 },
      {
        key: "gameMode",
        label: "Spielmodus",
        type: "select",
        default: "competitive",
        options: [
          { value: "competitive", label: "Competitive" },
          { value: "casual", label: "Casual" },
          { value: "wingman", label: "Wingman" },
          { value: "deathmatch", label: "Deathmatch" },
          { value: "armsrace", label: "Arms Race" },
        ],
      },
      { key: "startMap", label: "Startkarte", type: "text", default: "de_dust2", required: true, maxLength: 64 },
    ],
  },
];

export function getGameDefinition(gameType: string): GameDefinition | undefined {
  return GAME_CATALOG.find((g) => g.id === gameType);
}

export function defaultSettings(def: GameDefinition): SettingValues {
  return Object.fromEntries(def.settings.map((f) => [f.key, f.default]));
}

/** Splits a list field into trimmed entries. */
export function splitList(value: unknown): string[] {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validates and normalises settings against the catalog. Unknown keys are dropped;
 * missing keys fall back to `previous`, then to the field default.
 */
export function normalizeSettings(
  def: GameDefinition,
  input: Record<string, unknown>,
  previous: SettingValues = {}
): { values: SettingValues; errors: string[] } {
  const values: SettingValues = {};
  const errors: string[] = [];

  for (const field of def.settings) {
    const raw = input[field.key] ?? previous[field.key] ?? field.default;
    switch (field.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < field.min || n > field.max) {
          errors.push(`${field.label}: Zahl zwischen ${field.min} und ${field.max} erwartet.`);
          values[field.key] = field.default;
        } else values[field.key] = Math.round(n);
        break;
      }
      case "boolean":
        values[field.key] = raw === true || raw === "true";
        break;
      case "select": {
        const v = String(raw);
        if (!field.options.some((o) => o.value === v)) errors.push(`${field.label}: ungültige Auswahl.`);
        values[field.key] = field.options.some((o) => o.value === v) ? v : field.default;
        break;
      }
      case "list":
        values[field.key] = splitList(raw).join(", ");
        break;
      case "text":
      case "password": {
        // Newlines would break the container env file.
        const v = String(raw).replace(/[\r\n]/g, " ").trim();
        if (field.type === "text" && field.maxLength && v.length > field.maxLength) {
          errors.push(`${field.label}: höchstens ${field.maxLength} Zeichen.`);
        }
        if (field.type === "password" && v && field.minLength && v.length < field.minLength) {
          errors.push(`${field.label}: mindestens ${field.minLength} Zeichen.`);
        }
        const generated = field.type === "password" && field.generate;
        if (field.required && !v && !generated) errors.push(`${field.label} ist erforderlich.`);
        values[field.key] = v;
        break;
      }
    }
  }
  return { values, errors };
}
