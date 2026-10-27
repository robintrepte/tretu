import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// Must come first: modules below open the SQLite database on import.
import "./helpers/memory-db";

import { resolveDataPath } from "../src/lib/dashboard/host-access";
import { defaultSettings, GAME_CATALOG, getGameDefinition, normalizeSettings } from "../src/lib/games/catalog";
import { javaImageTag, normalizeMinecraftSource, validateMinecraftSource } from "../src/lib/games/minecraft-source";
import { readProfile } from "../src/lib/games/profile";
import { buildContainerSpec, parseProbe, probeScript, renderRuntimeFiles } from "../src/lib/games/runtime";
import { bootstrapScript } from "../src/lib/orchestrator/host";

function assertValidBash(script: string) {
  execFileSync("bash", ["-n"], { input: script });
}

test("java image tag follows the Minecraft version", () => {
  assert.equal(javaImageTag("1.12.2"), "java8");
  assert.equal(javaImageTag("1.16.5"), "java8");
  assert.equal(javaImageTag("1.18.2"), "java17");
  assert.equal(javaImageTag("1.20.4"), "java17");
  assert.equal(javaImageTag("1.20.6"), "java21");
  assert.equal(javaImageTag("1.21.8"), "java21");
  assert.equal(javaImageTag("LATEST"), "latest");
  assert.equal(javaImageTag("26.1"), "latest");
});

test("legacy Minecraft profiles are converted", () => {
  assert.deepEqual(normalizeMinecraftSource({ flavor: "forge", minecraftVersion: "1.20.1" }), {
    loader: "forge",
    version: "1.20.1",
    modpack: null,
    extraProjects: [],
  });
  const pack = normalizeMinecraftSource({
    flavor: "modpack",
    modpackSource: "modrinth",
    modrinthProjectId: "abc",
    modrinthVersionId: "v1",
    minecraftVersion: "1.20.1",
  });
  assert.equal(pack.loader, "modrinth");
  assert.equal(pack.modpack?.versionId, "v1");

  const legacyProfile = readProfile("minecraft", { flavor: "paper", minecraftVersion: "1.21.1" });
  assert.equal(legacyProfile.minecraft?.loader, "paper");
  assert.equal(legacyProfile.settings.maxPlayers, 20);
});

test("modpack source requires a selected version", () => {
  const errors = validateMinecraftSource({ loader: "modrinth", version: "1.20.1", modpack: null, extraProjects: [] });
  assert.equal(errors.length, 1);
});

test("settings are validated against the catalog", () => {
  const valheim = getGameDefinition("valheim")!;
  const { errors } = normalizeSettings(valheim, { password: "abc" });
  assert.ok(errors.some((e) => e.includes("mindestens 5")));

  const mc = getGameDefinition("minecraft")!;
  const { values, errors: mcErrors } = normalizeSettings(mc, { maxPlayers: "50", pvp: "false", motd: "a\nb", unknown: 1 });
  assert.deepEqual(mcErrors, []);
  assert.equal(values.maxPlayers, 50);
  assert.equal(values.pvp, false);
  assert.equal(values.motd, "a b");
  assert.equal("unknown" in values, false);
});

test("minecraft container spec maps loader and settings", () => {
  const def = getGameDefinition("minecraft")!;
  const spec = buildContainerSpec({
    gameType: "minecraft",
    name: "Test",
    memoryGb: 16,
    profile: {
      settings: { ...defaultSettings(def), whitelist: "Steve, Alex", ops: "" },
      minecraft: {
        loader: "fabric",
        version: "1.21.1",
        modpack: null,
        extraProjects: [{ projectId: "P7dR8mSH", slug: "fabric-api", title: "Fabric API" }],
      },
      secrets: { rconPassword: "secret" },
    },
  });
  assert.equal(spec.image, "itzg/minecraft-server:java21");
  assert.equal(spec.env.TYPE, "FABRIC");
  assert.equal(spec.env.VERSION, "1.21.1");
  assert.equal(spec.env.MEMORY, `${Math.floor(13.5 * 1024)}M`);
  assert.equal(spec.env.WHITELIST, "Steve,Alex");
  assert.equal(spec.env.OPS, undefined);
  assert.equal(spec.env.MODRINTH_PROJECTS, "fabric-api");
  assert.equal(spec.env.RCON_PASSWORD, "secret");
});

test("modrinth modpack spec", () => {
  const spec = buildContainerSpec({
    gameType: "minecraft",
    name: "Pack",
    memoryGb: 8,
    profile: {
      settings: defaultSettings(getGameDefinition("minecraft")!),
      minecraft: {
        loader: "modrinth",
        version: "1.20.1",
        modpack: { projectId: "1KVo5zza", slug: "fabulously-optimized", title: "FO", versionId: "abc", versionName: "1" },
        extraProjects: [],
      },
      secrets: {},
    },
  });
  assert.equal(spec.env.TYPE, "MODRINTH");
  assert.equal(spec.env.MODRINTH_MODPACK, "fabulously-optimized");
  assert.equal(spec.env.MODRINTH_VERSION, "abc");
  assert.equal(spec.env.VERSION, undefined);
  assert.equal(spec.image, "itzg/minecraft-server:java17");
});

test("every game renders a valid run script and env file", () => {
  for (const def of GAME_CATALOG) {
    const settings = { ...defaultSettings(def), password: "it's a \"test\" $HOME", adminPassword: "x", rconPassword: "y" };
    const profile = {
      settings,
      minecraft: def.id === "minecraft" ? normalizeMinecraftSource({ loader: "paper", version: "LATEST" }) : undefined,
      secrets: {},
    };
    const spec = buildContainerSpec({ gameType: def.id, name: def.label, memoryGb: 8, profile });
    const files = renderRuntimeFiles(spec);
    assertValidBash(files.script);
    assertValidBash(probeScript(def.id, profile));
    assert.ok(!/\n.*\n/.test(files.env.split("\n").filter(Boolean).find((l) => l.includes("\n")) ?? ""));
    assert.ok(files.script.includes("docker run -d"), def.id);
    // Every catalog port is published by the container.
    for (const port of def.ports) {
      assert.ok(
        spec.ports.some((p) => p.endsWith(`/${port.protocol}`) && p.includes(port.port.split("-")[0])),
        `${def.id} publishes ${port.port}/${port.protocol}`
      );
    }
  }
});

test("terraria password is passed as a single quoted argument", () => {
  const def = getGameDefinition("terraria")!;
  const spec = buildContainerSpec({
    gameType: "terraria",
    name: "T",
    memoryGb: 4,
    profile: { settings: { ...defaultSettings(def), password: "a b'c" }, secrets: {} },
  });
  const { script } = renderRuntimeFiles(spec);
  assert.ok(script.includes(`'-pass' \\\n  'a b'\\''c'`));
});

test("probe output is parsed", () => {
  const profile = readProfile("minecraft", {});
  const mc = parseProbe(
    "minecraft",
    profile,
    "STATE running|healthy|2026-01-01T00:00:00Z\nDISK 10000 2500\nMC There are 3 of a max of 20 players online: a, b, c"
  );
  assert.equal(mc.container, "running");
  assert.equal(mc.health, "healthy");
  assert.equal(mc.players, 3);
  assert.equal(mc.maxPlayers, 20);
  assert.equal(mc.diskUsedBytes, 2500);

  const valheim = parseProbe("valheim", readProfile("valheim", {}), 'STATE running||x\nVALHEIM {"player_count": 2, "error": null}');
  assert.equal(valheim.players, 2);

  const missing = parseProbe("palworld", readProfile("palworld", {}), "STATE missing||\nPALWORLD ");
  assert.equal(missing.container, "missing");
  assert.equal(missing.players, null);
});

test("file paths cannot escape the data directory", () => {
  assert.equal(resolveDataPath(""), "/srv/game/data");
  assert.equal(resolveDataPath("mods/a.jar"), "/srv/game/data/mods/a.jar");
  assert.equal(resolveDataPath("../../etc/passwd"), "/srv/game/data/etc/passwd");
  assert.equal(resolveDataPath("/world/../server.properties"), "/srv/game/data/server.properties");
});

test("host bootstrap script is valid bash", () => {
  const script = bootstrapScript(
    { id: 1, slug: "test-mc" } as Parameters<typeof bootstrapScript>[0],
    "/dev/disk/by-id/scsi-0HC_Volume_123"
  );
  assertValidBash(script);
});
