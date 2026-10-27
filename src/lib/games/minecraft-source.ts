/** Client-safe description of where a Minecraft server's software comes from. */

export const MINECRAFT_LOADERS = [
  { id: "vanilla", label: "Vanilla", description: "Offizieller Mojang-Server ohne Mods.", mods: false },
  { id: "paper", label: "Paper", description: "Schneller Server mit Plugin-Support (Bukkit/Spigot).", mods: true },
  { id: "purpur", label: "Purpur", description: "Paper-Fork mit vielen Extra-Optionen, Plugins.", mods: true },
  { id: "fabric", label: "Fabric", description: "Leichter Mod-Loader für moderne Mods.", mods: true },
  { id: "forge", label: "Forge", description: "Klassischer Mod-Loader.", mods: true },
  { id: "neoforge", label: "NeoForge", description: "Moderner Forge-Nachfolger (ab 1.20.2).", mods: true },
  { id: "modrinth", label: "Modpack (Modrinth)", description: "Komplettes Modpack von modrinth.com.", mods: true },
  { id: "curseforge", label: "Modpack (CurseForge)", description: "Komplettes Modpack von curseforge.com.", mods: true },
] as const;

export type MinecraftLoader = (typeof MINECRAFT_LOADERS)[number]["id"];

export type MinecraftModpack = {
  /** Modrinth project id or CurseForge mod id. */
  projectId: string;
  slug: string;
  title: string;
  /** Modrinth version id or CurseForge file id. */
  versionId: string;
  versionName: string;
};

export type MinecraftProject = { projectId: string; slug: string; title: string };

export type MinecraftSource = {
  loader: MinecraftLoader;
  /** Minecraft version, "LATEST" for the newest release. For modpacks: the pack's game version (selects Java). */
  version: string;
  modpack: MinecraftModpack | null;
  /** Extra Modrinth mods/plugins, installed automatically in a compatible version. */
  extraProjects: MinecraftProject[];
};

export function isModpackLoader(loader: MinecraftLoader): boolean {
  return loader === "modrinth" || loader === "curseforge";
}

/** Plugin loaders use Modrinth "plugin" projects, the rest "mod" projects. */
export function modrinthProjectKind(loader: MinecraftLoader): { type: "mod" | "plugin"; category: string } | null {
  switch (loader) {
    case "paper":
    case "purpur":
      return { type: "plugin", category: loader === "purpur" ? "purpur" : "paper" };
    case "fabric":
    case "forge":
    case "neoforge":
      return { type: "mod", category: loader };
    default:
      return null;
  }
}

const LOADER_IDS = new Set<string>(MINECRAFT_LOADERS.map((l) => l.id));

function asString(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** Accepts the current shape as well as the pre-overhaul `{ flavor, minecraftVersion, … }` profile. */
export function normalizeMinecraftSource(raw: unknown): MinecraftSource {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  if (typeof r.loader === "string" && LOADER_IDS.has(r.loader)) {
    const modpack = r.modpack as Record<string, unknown> | null | undefined;
    const extras = Array.isArray(r.extraProjects) ? (r.extraProjects as Array<Record<string, unknown>>) : [];
    return {
      loader: r.loader as MinecraftLoader,
      version: asString(r.version) || "LATEST",
      modpack:
        modpack && asString(modpack.projectId) && asString(modpack.versionId)
          ? {
              projectId: asString(modpack.projectId),
              slug: asString(modpack.slug),
              title: asString(modpack.title) || asString(modpack.slug),
              versionId: asString(modpack.versionId),
              versionName: asString(modpack.versionName),
            }
          : null,
      extraProjects: extras
        .filter((p) => asString(p.slug) || asString(p.projectId))
        .map((p) => ({ projectId: asString(p.projectId), slug: asString(p.slug), title: asString(p.title) })),
    };
  }

  // Legacy profile from the systemd-based implementation.
  const flavor = asString(r.flavor) || "paper";
  const version = asString(r.minecraftVersion) || "LATEST";
  if (flavor === "modpack") {
    const cf = asString(r.modpackSource) === "curseforge";
    return {
      loader: cf ? "curseforge" : "modrinth",
      version,
      modpack: {
        projectId: cf ? asString(r.curseforgeModId) : asString(r.modrinthProjectId),
        slug: cf ? asString(r.curseforgeModId) : asString(r.modrinthProjectId),
        title: "Modpack",
        versionId: cf ? asString(r.curseforgeFileId) : asString(r.modrinthVersionId),
        versionName: "",
      },
      extraProjects: [],
    };
  }
  return {
    loader: (LOADER_IDS.has(flavor) ? flavor : "paper") as MinecraftLoader,
    version,
    modpack: null,
    extraProjects: [],
  };
}

export function validateMinecraftSource(source: MinecraftSource): string[] {
  const errors: string[] = [];
  if (isModpackLoader(source.loader)) {
    if (!source.modpack?.projectId || !source.modpack.versionId) errors.push("Bitte ein Modpack und eine Version wählen.");
  } else if (!/^(LATEST|[0-9][0-9a-z.\-]*)$/i.test(source.version)) {
    errors.push("Ungültige Minecraft-Version.");
  }
  if (source.extraProjects.length > 100) errors.push("Höchstens 100 zusätzliche Mods/Plugins.");
  return errors;
}

/**
 * itzg/minecraft-server image tag with a matching Java runtime:
 * < 1.17 → Java 8, 1.17–1.20.4 → Java 17, 1.20.5–1.21.x → Java 21, newer → latest.
 */
export function javaImageTag(version: string): string {
  if (version.toUpperCase() === "LATEST") return "latest";
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(version);
  if (!m) return /^\d{2}\./.test(version) ? "latest" : "java21";
  const minor = Number(m[1]);
  const patch = Number(m[2] ?? 0);
  if (minor < 17) return "java8";
  if (minor < 20 || (minor === 20 && patch < 5)) return "java17";
  return "java21";
}
