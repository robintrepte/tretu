import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { gameInstances, infraServers, infraVolumes } from "@/db/schema";
import { cloudflareClient } from "@/lib/cloudflare/client";
import { HETZNER_DEFAULT_SERVER_IMAGE } from "@/lib/env/server";
import { getGameDefinition } from "@/lib/games/catalog";
import { readProfile } from "@/lib/games/profile";
import {
  buildContainerSpec,
  CONTAINER_NAME,
  HOST_BACKUPS,
  HOST_DATA,
  HOST_ROOT,
  renderRuntimeFiles,
} from "@/lib/games/runtime";
import { hetznerClient, type FirewallRule } from "@/lib/hetzner/client";
import type { JobContext } from "@/lib/orchestrator/jobs";
import { runRemote, shq, uploadFile, waitForSsh } from "@/lib/orchestrator/ssh";
import { getCloudflareConfig, getSshCredentials } from "@/lib/settings/store";

export type InstanceRow = typeof gameInstances.$inferSelect;
export type ServerRow = typeof infraServers.$inferSelect;
export type VolumeRow = typeof infraVolumes.$inferSelect;

const labels = (instance: InstanceRow) => ({ managed_by: "tretu", tretu_instance: String(instance.id) });

export function getActiveServer(instanceId: number): ServerRow | undefined {
  return db
    .select()
    .from(infraServers)
    .where(and(eq(infraServers.instanceId, instanceId), isNull(infraServers.deletedAt)))
    .orderBy(desc(infraServers.createdAt))
    .get();
}

export function getVolume(instanceId: number): VolumeRow | undefined {
  return db
    .select()
    .from(infraVolumes)
    .where(eq(infraVolumes.instanceId, instanceId))
    .orderBy(desc(infraVolumes.createdAt))
    .get();
}

export function reloadInstance(instanceId: number): InstanceRow {
  const instance = db.select().from(gameInstances).where(eq(gameInstances.id, instanceId)).get();
  if (!instance) throw new Error("Instanz nicht gefunden.");
  return instance;
}

/** Address players connect to (subdomain when Cloudflare is configured, otherwise the IP). */
export function instanceHostname(instance: InstanceRow): string | null {
  const cf = getCloudflareConfig();
  if (!cf || !instance.subdomain) return null;
  return `${instance.subdomain}.${cf.domain}`;
}

export async function ensureVolume(instance: InstanceRow, ctx: JobContext): Promise<VolumeRow> {
  const existing = getVolume(instance.id);
  if (existing) {
    if (!existing.linuxDevice) {
      const remote = await hetznerClient.getVolume(existing.hetznerVolumeId);
      db.update(infraVolumes).set({ linuxDevice: remote.linux_device }).where(eq(infraVolumes.id, existing.id)).run();
      return { ...existing, linuxDevice: remote.linux_device };
    }
    return existing;
  }

  const def = getGameDefinition(instance.gameType);
  const profile = readProfile(instance.gameType, instance.configProfile);
  const sizeGb = Math.max(def?.minVolumeGb ?? 10, profile.volumeSizeGb ?? def?.defaultVolumeGb ?? 10);

  ctx.step(`Speicher anlegen (${sizeGb} GB)`);
  const volume = await hetznerClient.createVolume({
    name: `tretu-${instance.slug}`,
    sizeGb,
    location: instance.region,
    labels: labels(instance),
  });
  db.insert(infraVolumes)
    .values({
      instanceId: instance.id,
      hetznerVolumeId: String(volume.id),
      linuxDevice: volume.linux_device,
      mountPath: HOST_ROOT,
      sizeGb,
      status: "available",
    })
    .run();
  ctx.log(`Volume ${volume.id} erstellt.`);
  return getVolume(instance.id)!;
}

function firewallRules(gameType: string): FirewallRule[] {
  const def = getGameDefinition(gameType);
  const anywhere = ["0.0.0.0/0", "::/0"];
  return [
    { direction: "in", protocol: "tcp", port: "22", source_ips: anywhere, description: "SSH (Dashboard)" },
    { direction: "in", protocol: "icmp", source_ips: anywhere, description: "Ping" },
    ...(def?.ports ?? []).map(
      (p): FirewallRule => ({
        direction: "in",
        protocol: p.protocol,
        port: p.port,
        source_ips: anywhere,
        description: p.label,
      })
    ),
  ];
}

export async function ensureFirewall(instance: InstanceRow, ctx: JobContext): Promise<number> {
  const rules = firewallRules(instance.gameType);
  if (instance.hetznerFirewallId) {
    try {
      await hetznerClient.setFirewallRules(instance.hetznerFirewallId, rules);
      return Number(instance.hetznerFirewallId);
    } catch (error) {
      ctx.log(`Firewall ${instance.hetznerFirewallId} nicht nutzbar, lege neu an: ${(error as Error).message}`);
    }
  }
  ctx.step("Firewall anlegen");
  const firewall = await hetznerClient.createFirewall(`tretu-${instance.slug}-${Date.now().toString(36)}`, rules, labels(instance));
  db.update(gameInstances)
    .set({ hetznerFirewallId: String(firewall.id) })
    .where(eq(gameInstances.id, instance.id))
    .run();
  return firewall.id;
}

export function bootstrapScript(instance: InstanceRow, device: string): string {
  const legacyDir = `/srv/tretu/${instance.slug}`;
  return `
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
cloud-init status --wait >/dev/null 2>&1 || true

# Pre-overhaul hosts ran Minecraft as a systemd unit.
systemctl disable --now ${shq(`mc-${instance.slug}`)} >/dev/null 2>&1 || true

if ! command -v docker >/dev/null 2>&1; then
  echo "Installiere Docker…"
  for i in $(seq 1 30); do
    if curl -fsSL https://get.docker.com -o /tmp/get-docker.sh; then break; fi
    sleep 5
  done
  sh /tmp/get-docker.sh
fi
systemctl enable --now docker >/dev/null

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

DEV=${shq(device)}
for i in $(seq 1 60); do [ -e "$DEV" ] && break; sleep 2; done
[ -e "$DEV" ] || { echo "Volume-Gerät $DEV wurde nicht gefunden" >&2; exit 1; }
blkid "$DEV" >/dev/null 2>&1 || mkfs.ext4 -q -F "$DEV"
mkdir -p ${HOST_ROOT}
grep -q "$DEV" /etc/fstab || echo "$DEV ${HOST_ROOT} ext4 discard,nofail,defaults 0 0" >> /etc/fstab
mountpoint -q ${HOST_ROOT} || mount ${HOST_ROOT}
resize2fs "$DEV" >/dev/null 2>&1 || true
mkdir -p ${HOST_DATA} ${HOST_BACKUPS}

# Pre-overhaul layouts: world files directly on the volume root or on the VM disk.
if [ -z "$(ls -A ${HOST_DATA})" ]; then
  if [ -f ${HOST_ROOT}/server.properties ]; then
    find ${HOST_ROOT} -mindepth 1 -maxdepth 1 ! -name data ! -name backups ! -name lost+found -exec mv {} ${HOST_DATA}/ \\;
  elif [ -d ${shq(legacyDir)} ] && [ -n "$(ls -A ${shq(legacyDir)})" ]; then
    cp -a ${shq(legacyDir)}/. ${HOST_DATA}/
  fi
fi
echo "Host bereit."
`;
}

export async function syncDns(instance: InstanceRow, ip: string, ctx: JobContext) {
  const cf = getCloudflareConfig();
  const fqdn = instanceHostname(instance);
  if (!cf?.zoneId || !fqdn) return;
  try {
    const recordId = await cloudflareClient.upsertARecord(cf.token, cf.zoneId, fqdn, ip, instance.dnsRecordId);
    db.update(gameInstances).set({ dnsRecordId: recordId }).where(eq(gameInstances.id, instance.id)).run();
    ctx.log(`DNS: ${fqdn} → ${ip}`);
  } catch (error) {
    // DNS is a convenience; the server stays reachable via IP.
    ctx.log(`⚠ DNS-Eintrag konnte nicht gesetzt werden: ${(error as Error).message}`);
  }
}

export async function removeDns(instance: InstanceRow, ctx: JobContext) {
  const cf = getCloudflareConfig();
  if (!cf?.zoneId || !instance.dnsRecordId) return;
  try {
    await cloudflareClient.deleteRecord(cf.token, cf.zoneId, instance.dnsRecordId);
    db.update(gameInstances).set({ dnsRecordId: null }).where(eq(gameInstances.id, instance.id)).run();
  } catch (error) {
    ctx.log(`⚠ DNS-Eintrag konnte nicht entfernt werden: ${(error as Error).message}`);
  }
}

/** Makes sure a VM with the volume mounted and Docker installed is running; returns its IP. */
export async function ensureHost(instance: InstanceRow, ctx: JobContext): Promise<{ ip: string; server: ServerRow }> {
  const volume = await ensureVolume(instance, ctx);
  let server = getActiveServer(instance.id);

  if (server) {
    const remote = await hetznerClient.getServer(server.hetznerServerId);
    if (!remote) {
      ctx.log("Die bisherige VM existiert bei Hetzner nicht mehr – erstelle eine neue.");
      db.update(infraServers)
        .set({ deletedAt: new Date(), status: "deleted" })
        .where(eq(infraServers.id, server.id))
        .run();
      server = undefined;
    } else if (remote.status === "off") {
      ctx.step("VM einschalten");
      await hetznerClient.powerOn(server.hetznerServerId);
    }
  }

  if (!server) {
    const ssh = getSshCredentials();
    if (!ssh?.hetznerKeyId) throw new Error("SSH-Schlüssel ist nicht bei Hetzner hinterlegt – Einrichtung abschließen.");
    const firewallId = await ensureFirewall(reloadInstance(instance.id), ctx);

    ctx.step(`VM erstellen (${instance.activeServerType}, ${instance.region})`);
    const { server: created } = await hetznerClient.createServer({
      name: `tretu-${instance.slug}`,
      serverType: instance.activeServerType,
      image: HETZNER_DEFAULT_SERVER_IMAGE,
      location: instance.region,
      volumeIds: [Number(volume.hetznerVolumeId)],
      sshKeyIds: [ssh.hetznerKeyId],
      firewallIds: [firewallId],
      labels: labels(instance),
    });
    const res = db
      .insert(infraServers)
      .values({
        instanceId: instance.id,
        hetznerServerId: String(created.id),
        name: created.name,
        ipV4: created.public_net?.ipv4?.ip ?? null,
        status: "provisioning",
      })
      .run();
    server = db.select().from(infraServers).where(eq(infraServers.id, Number(res.lastInsertRowid))).get()!;
    db.update(infraVolumes).set({ status: "attached" }).where(eq(infraVolumes.id, volume.id)).run();
    db.update(gameInstances).set({ lastActivityAt: new Date() }).where(eq(gameInstances.id, instance.id)).run();
    ctx.log(`VM ${created.id} angelegt.`);
  }

  ctx.step("Auf VM warten");
  const running = await hetznerClient.waitForServerRunning(server.hetznerServerId);
  const ip = running.public_net.ipv4!.ip;
  if (server.ipV4 !== ip) {
    db.update(infraServers).set({ ipV4: ip }).where(eq(infraServers.id, server.id)).run();
  }

  await syncDns(reloadInstance(instance.id), ip, ctx);

  ctx.step("SSH-Verbindung aufbauen");
  await waitForSsh(ip);

  ctx.step("Host vorbereiten (Docker, Speicher)");
  await runRemote(ip, bootstrapScript(instance, getVolume(instance.id)!.linuxDevice!), "Host-Vorbereitung", {
    timeoutMs: 600_000,
    onOutput: ctx.output,
  });
  db.update(infraServers).set({ status: "running" }).where(eq(infraServers.id, server.id)).run();

  return { ip, server: getActiveServer(instance.id)! };
}

/** Writes env/run script for the current settings and (re)creates the game container. */
export async function deployContainer(instance: InstanceRow, ip: string, ctx: JobContext) {
  const server = getActiveServer(instance.id);
  const remote = server ? await hetznerClient.getServer(server.hetznerServerId) : null;
  const memoryGb = remote?.server_type.memory ?? 4;
  const profile = readProfile(instance.gameType, instance.configProfile);
  const spec = buildContainerSpec({ gameType: instance.gameType, name: instance.name, profile, memoryGb });
  const files = renderRuntimeFiles(spec);

  ctx.step("Konfiguration schreiben");
  await uploadFile(ip, `${HOST_ROOT}/game.env`, files.env, 0o600);
  await uploadFile(ip, `${HOST_ROOT}/run.sh`, files.script, 0o755);

  ctx.step(`Image laden (${spec.image})`);
  await runRemote(ip, `docker pull -q ${shq(spec.image)}`, "docker pull", { timeoutMs: 900_000, onOutput: ctx.output });

  ctx.step("Spielserver starten");
  await runRemote(ip, `bash ${HOST_ROOT}/run.sh`, "Container-Start", { timeoutMs: 120_000, onOutput: ctx.output });

  // Catch immediate crashes (bad settings, wrong version) instead of reporting success.
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  const state = (
    await runRemote(ip, `docker inspect -f '{{.State.Status}} {{.RestartCount}}' ${CONTAINER_NAME}`, "Status")
  ).trim();
  const [status, restarts] = state.split(" ");
  if (status !== "running" || Number(restarts) > 0) {
    const logs = await runRemote(ip, `docker logs --tail 40 ${CONTAINER_NAME} 2>&1`, "Logs").catch(() => "");
    ctx.log(logs);
    throw new Error(`Der Spielserver ist direkt nach dem Start abgestürzt (Status: ${status}). Details im Log.`);
  }
  ctx.log("Container läuft. Das Spiel braucht je nach Spiel/Modpack noch einige Minuten, bis es erreichbar ist.");
}

export async function stopContainer(ip: string, ctx: JobContext) {
  ctx.step("Spielserver sauber beenden");
  await runRemote(ip, `docker stop -t 120 ${CONTAINER_NAME} >/dev/null 2>&1 || true`, "docker stop", {
    timeoutMs: 180_000,
  });
}

/** Deletes the VM (the volume with all data stays). */
export async function destroyHost(instance: InstanceRow, ctx: JobContext) {
  const server = getActiveServer(instance.id);
  if (server) {
    ctx.step("VM löschen");
    await hetznerClient.deleteServer(server.hetznerServerId);
    db.update(infraServers)
      .set({ deletedAt: new Date(), status: "deleted" })
      .where(eq(infraServers.id, server.id))
      .run();
  }
  const volume = getVolume(instance.id);
  if (volume) db.update(infraVolumes).set({ status: "available" }).where(eq(infraVolumes.id, volume.id)).run();
  await removeDns(reloadInstance(instance.id), ctx);
}
