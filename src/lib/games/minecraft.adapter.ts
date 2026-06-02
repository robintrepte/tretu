import { eq } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances } from "@/db/schema";
import { BaseAdapter } from "@/lib/games/base";
import type { AdapterContext, LiveStatus } from "@/lib/games/types";
import { jvmHeapGbForServerType } from "@/lib/hetzner/server-memory";
import { resolveCurseForgeFileDownload } from "@/lib/minecraft/curseforge";
import { resolveForgeInstallerUrl } from "@/lib/minecraft/forge";
import { resolveModrinthVersionDownload } from "@/lib/minecraft/modrinth";
import { resolveVanillaServerJarUrl } from "@/lib/minecraft/mojang";
import { resolvePaperJarDownload } from "@/lib/minecraft/paper";
import { executeRemoteCommand, requireRemoteSuccess, uploadFile } from "@/lib/orchestrator/ssh";

type McConfig = {
  flavor?: "vanilla" | "paper" | "forge" | "modpack";
  minecraftVersion?: string;
  modpackSource?: "modrinth" | "curseforge";
  modrinthProjectId?: string;
  modrinthVersionId?: string;
  curseforgeModId?: string;
  curseforgeFileId?: string;
};

function b64Utf8(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function safeMotd(name: string): string {
  return name.replace(/[^\w \-.,!]/g, "").slice(0, 200);
}

export class MinecraftAdapter extends BaseAdapter {
  gameType = "minecraft";

  async provisionRuntime(ctx: AdapterContext): Promise<void> {
    if (!ctx.host) throw new Error("No host provided for provisioning");

    const instance = db.select().from(gameInstances).where(eq(gameInstances.id, ctx.instanceId)).get();
    if (!instance) throw new Error("Instance not found");

    const config = instance.configProfile as McConfig;
    const flavor = config.flavor ?? "paper";
    const memoryGb = jvmHeapGbForServerType(instance.activeServerType);
    const mcVersion = config.minecraftVersion;
    const mount = ctx.mountPath;
    const slug = instance.slug;

    const bootstrap = await executeRemoteCommand(
      ctx.host,
      [
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get update -qq",
        "apt-get install -y -qq openjdk-21-jre-headless curl wget unzip ca-certificates",
        `mkdir -p "${mount}"`,
      ].join(" && ")
    );
    requireRemoteSuccess(bootstrap, "Host-Pakete / Mount");

    let useLaunchScript = false;

    if (flavor === "modpack") {
      const source = config.modpackSource ?? "modrinth";
      const resolved =
        source === "curseforge"
          ? (() => {
              if (!config.curseforgeModId || !config.curseforgeFileId) {
                throw new Error(
                  "Modpack (CurseForge): modId/fileId fehlt. Bitte Modpack-Datei neu auswählen."
                );
              }
              return resolveCurseForgeFileDownload(config.curseforgeModId, config.curseforgeFileId);
            })()
          : (() => {
              if (!config.modrinthVersionId) {
                throw new Error(
                  "Modpack (Modrinth): Bitte eine Version wählen (modrinthVersionId fehlt)."
                );
              }
              return resolveModrinthVersionDownload(config.modrinthVersionId);
            })();

      const { url, filename } = await resolved;
      const lower = filename.toLowerCase();
      if (!lower.endsWith(".zip")) {
        throw new Error(
          `Modpack-Datei „${filename}“ ist kein .zip-Serverpack. Wähle ein Pack mit auslieferbarem Server-ZIP auf Modrinth, oder nutze Paper/Vanilla/Forge. (.mrpack wird hier nicht automatisch installiert.)`
        );
      }

      const unpack = await executeRemoteCommand(
        ctx.host,
        [
          "set -e",
          `URL=$(echo ${b64Utf8(url)} | base64 -d)`,
          `FN=$(echo ${b64Utf8(filename)} | base64 -d)`,
          `curl -fsSL "$URL" -o "/tmp/$FN"`,
          `unzip -oq "/tmp/$FN" -d "${mount}"`,
          `rm -f "/tmp/$FN"`,
          `find "${mount}" -maxdepth 4 \\( -name start.sh -o -name startserver.sh -o -name run.sh \\) -exec chmod +x {} \\; 2>/dev/null || true`,
        ].join("\n")
      );
      requireRemoteSuccess(unpack, "Modpack-Download / Entpacken");
      useLaunchScript = true;
    } else {
      if (!mcVersion) throw new Error("minecraftVersion fehlt im Konfigprofil.");

      if (flavor === "vanilla") {
        const jarUrl = await resolveVanillaServerJarUrl(mcVersion);
        const dl = await executeRemoteCommand(
          ctx.host,
          [
            "set -e",
            `URL=$(echo ${b64Utf8(jarUrl)} | base64 -d)`,
            `curl -fsSL "$URL" -o "${mount}/server.jar"`,
          ].join("\n")
        );
        requireRemoteSuccess(dl, "Vanilla server.jar");
      } else if (flavor === "paper") {
        const { url } = await resolvePaperJarDownload(mcVersion);
        const dl = await executeRemoteCommand(
          ctx.host,
          [
            "set -e",
            `URL=$(echo ${b64Utf8(url)} | base64 -d)`,
            `curl -fsSL "$URL" -o "${mount}/server.jar"`,
          ].join("\n")
        );
        requireRemoteSuccess(dl, "Paper server.jar");
      } else if (flavor === "forge") {
        const { installerUrl } = await resolveForgeInstallerUrl(mcVersion);
        const inst = await executeRemoteCommand(
          ctx.host,
          [
            "set -e",
            `URL=$(echo ${b64Utf8(installerUrl)} | base64 -d)`,
            `curl -fsSL "$URL" -o "${mount}/forge-installer.jar"`,
          ].join("\n")
        );
        requireRemoteSuccess(inst, "Forge installer download");
      } else {
        throw new Error(`Unbekannter flavor: ${String(flavor)}`);
      }

      if (flavor === "forge") {
        const run = await executeRemoteCommand(
          ctx.host,
          [
            "set -e",
            `cd "${mount}"`,
            "java -jar forge-installer.jar --installServer",
            "rm -f forge-installer.jar",
            `printf '%s\\n' "-Xmx${memoryGb}G" "-Xms${memoryGb}G" > user_jvm_args.txt || true`,
            `find "${mount}" -maxdepth 3 -name run.sh -exec chmod +x {} \\; 2>/dev/null || true`,
            `find "${mount}" -maxdepth 3 -name start.sh -exec chmod +x {} \\; 2>/dev/null || true`,
          ].join("\n")
        );
        requireRemoteSuccess(run, "Forge --installServer");
        useLaunchScript = true;
      }
    }

    await uploadFile(ctx.host, `${mount}/eula.txt`, "eula=true\n");

    const serverProperties = [
      "server-port=25565",
      "query.port=25565",
      "enable-query=true",
      `motd=${safeMotd(instance.name || "Tretu")}`,
      "max-players=20",
      "view-distance=10",
      "enforce-secure-profile=false",
    ].join("\n");
    await uploadFile(ctx.host, `${mount}/server.properties`, serverProperties);

    const launchScript = [
      "#!/bin/bash",
      "set -euo pipefail",
      `cd "${mount}"`,
      `MEM=${memoryGb}`,
      "if [ -x ./startserver.sh ]; then exec ./startserver.sh; fi",
      "if [ -x ./start.sh ]; then exec ./start.sh; fi",
      "if [ -x ./run.sh ]; then exec ./run.sh; fi",
      "exec java -Xmx${MEM}G -Xms${MEM}G -jar server.jar nogui",
    ].join("\n");

    if (useLaunchScript || flavor === "forge") {
      await uploadFile(ctx.host, `${mount}/tretu-launch.sh`, launchScript);
      requireRemoteSuccess(
        await executeRemoteCommand(ctx.host, `chmod +x "${mount}/tretu-launch.sh"`),
        "chmod tretu-launch.sh"
      );
    }

    const execStart =
      useLaunchScript || flavor === "forge"
        ? `/bin/bash ${mount}/tretu-launch.sh`
        : `/usr/bin/java -Xmx${memoryGb}G -Xms${memoryGb}G -jar ${mount}/server.jar nogui`;

    const systemdService = [
      "[Unit]",
      `Description=Minecraft (${slug})`,
      "After=network.target",
      "",
      "[Service]",
      "Type=simple",
      `WorkingDirectory=${mount}`,
      `ExecStart=${execStart}`,
      "Restart=on-failure",
      "RestartSec=10",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
    ].join("\n");

    await uploadFile(ctx.host, `/etc/systemd/system/mc-${slug}.service`, systemdService);
    requireRemoteSuccess(await executeRemoteCommand(ctx.host, "systemctl daemon-reload"), "systemctl daemon-reload");
  }

  async start(ctx: AdapterContext): Promise<void> {
    if (!ctx.host) throw new Error("No host provided");
    const instance = db.select().from(gameInstances).where(eq(gameInstances.id, ctx.instanceId)).get();
    if (!instance) return;

    requireRemoteSuccess(
      await executeRemoteCommand(ctx.host, `systemctl start mc-${instance.slug}`),
      "systemctl start"
    );
  }

  async stop(ctx: AdapterContext): Promise<void> {
    if (!ctx.host) throw new Error("No host provided");
    const instance = db.select().from(gameInstances).where(eq(gameInstances.id, ctx.instanceId)).get();
    if (!instance) return;

    requireRemoteSuccess(
      await executeRemoteCommand(ctx.host, `systemctl stop mc-${instance.slug}`),
      "systemctl stop"
    );
  }

  async fetchLiveStatus(ctx: AdapterContext): Promise<LiveStatus> {
    if (!ctx.host) return { infraStatus: "no_host", gameStatus: "stopped", playerCount: null, maxPlayers: null };

    const instance = db.select().from(gameInstances).where(eq(gameInstances.id, ctx.instanceId)).get();
    if (!instance) return { infraStatus: "error", gameStatus: "error", playerCount: null, maxPlayers: null };

    const res = await executeRemoteCommand(ctx.host, `systemctl is-active mc-${instance.slug}`);
    const isRunning = res.stdout.trim() === "active";

    return {
      infraStatus: "running",
      gameStatus: isRunning ? "running" : "stopped",
      playerCount: null,
      maxPlayers: null,
    };
  }
}
