import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { gameBackups, gameInstances, infraVolumes } from "@/db/schema";
import { backupScript, restoreScript } from "@/lib/games/backup-scripts";
import { CONTAINER_NAME, HOST_BACKUPS, HOST_DATA, HOST_ROOT } from "@/lib/games/runtime";
import { hetznerClient } from "@/lib/hetzner/client";
import {
  deployContainer,
  destroyHost,
  ensureHost,
  getActiveServer,
  getVolume,
  reloadInstance,
  stopContainer,
  type InstanceRow,
} from "@/lib/orchestrator/host";
import { cancelQueuedJobs, type JobContext } from "@/lib/orchestrator/jobs";
import { executeRemoteCommand, runRemote, shq } from "@/lib/orchestrator/ssh";

type Payload = Record<string, unknown>;

async function setInstance(instanceId: number, values: Partial<typeof gameInstances.$inferInsert>) {
  await db
    .update(gameInstances)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(gameInstances.id, instanceId));
}

/** IP of the running VM, or an error explaining that the server has to be started first. */
async function requireHostIp(instance: InstanceRow, what: string): Promise<string> {
  const server = await getActiveServer(instance.id);
  if (!server?.ipV4) throw new Error(`${what} geht nur, während der Server eingeschaltet ist. Bitte zuerst starten.`);
  return server.ipV4;
}

async function containerExists(ip: string) {
  const res = await executeRemoteCommand(ip, `docker inspect ${CONTAINER_NAME} >/dev/null 2>&1`);
  return res.code === 0;
}

async function start(instance: InstanceRow, ctx: JobContext) {
  await setInstance(instance.id, { desiredState: "running", lastActivityAt: new Date() });
  const { ip } = await ensureHost(instance, ctx);
  await reconcileBackups(instance, ip, ctx);
  await deployContainer(await reloadInstance(instance.id), ip, ctx);
  await setInstance(instance.id, { lastActivityAt: new Date() });
}

/** Aligns the backup list with the files actually present on the volume. */
async function reconcileBackups(instance: InstanceRow, ip: string, ctx: JobContext) {
  const out = await runRemote(ip, `ls -1 ${HOST_BACKUPS} 2>/dev/null | grep '\\.tar\\.gz$' || true`, "Backups prüfen");
  const files = new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
  const rows = await db.select().from(gameBackups).where(eq(gameBackups.instanceId, instance.id));
  const known = new Set(rows.map((r) => r.fileName));

  for (const row of rows) {
    if (!files.has(row.fileName)) await db.delete(gameBackups).where(eq(gameBackups.id, row.id));
  }
  const unknown = [...files].filter((f) => !known.has(f));
  if (unknown.length) {
    await db.insert(gameBackups).values(unknown.map((fileName) => ({ instanceId: instance.id, fileName, kind: "gefunden" })));
  }
  if (unknown.length) ctx.log(`${unknown.length} Backup-Datei(en) auf dem Speicher gefunden und übernommen.`);
}

async function stop(instance: InstanceRow, ctx: JobContext) {
  const ip = await requireHostIp(instance, "Stoppen");
  await stopContainer(ip, ctx);
}

async function restart(instance: InstanceRow, ctx: JobContext) {
  const ip = await requireHostIp(instance, "Neustarten");
  if (!(await containerExists(ip))) {
    await deployContainer(instance, ip, ctx);
    return;
  }
  ctx.step("Spielserver neu starten");
  await runRemote(ip, `docker restart -t 120 ${CONTAINER_NAME}`, "docker restart", { timeoutMs: 240_000 });
  await setInstance(instance.id, { lastActivityAt: new Date() });
}

async function apply(instance: InstanceRow, ctx: JobContext) {
  const server = await getActiveServer(instance.id);
  if (!server?.ipV4) {
    ctx.log("Server ist aus – die Einstellungen werden beim nächsten Start übernommen.");
    return;
  }
  const { ip } = await ensureHost(instance, ctx);
  await deployContainer(await reloadInstance(instance.id), ip, ctx);
}

function backupFileName(kind: string) {
  const ts = new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "");
  return `${ts}-${kind}.tar.gz`;
}

export async function createBackup(instance: InstanceRow, ip: string, kind: string, ctx: JobContext) {
  ctx.step("Backup erstellen");
  const fileName = backupFileName(kind);
  const script = backupScript({
    gameType: instance.gameType,
    fileName,
    containerRunning: await containerExists(ip),
  });

  const out = await runRemote(ip, script, "Backup", { timeoutMs: 3_600_000 });
  const size = Number(out.trim().split("\n").pop());
  await db.insert(gameBackups).values({
    instanceId: instance.id,
    fileName,
    sizeBytes: Number.isFinite(size) ? size : null,
    kind,
    createdByUserId: ctx.userId,
  });
  ctx.log(`Backup ${fileName} (${Number.isFinite(size) ? `${(size / 1024 / 1024).toFixed(1)} MB` : "?"}) erstellt.`);
  await pruneBackups(await reloadInstance(instance.id), ip, ctx);
}

async function pruneBackups(instance: InstanceRow, ip: string, ctx: JobContext) {
  const keep = Math.max(1, instance.backupRetention);
  const all = await db
    .select()
    .from(gameBackups)
    .where(eq(gameBackups.instanceId, instance.id))
    .orderBy(desc(gameBackups.createdAt), desc(gameBackups.id));
  for (const old of all.slice(keep)) {
    await runRemote(ip, `rm -f ${HOST_BACKUPS}/${shq(old.fileName)}`, "Altes Backup löschen");
    await db.delete(gameBackups).where(eq(gameBackups.id, old.id));
    ctx.log(`Altes Backup ${old.fileName} entfernt (behalte ${keep}).`);
  }
}

async function backupRow(instanceId: number, payload: Payload) {
  const backupId = Number(payload.backupId);
  if (!Number.isInteger(backupId) || backupId <= 0) throw new Error("Backup nicht gefunden.");
  const [row] = await db
    .select()
    .from(gameBackups)
    .where(and(eq(gameBackups.id, backupId), eq(gameBackups.instanceId, instanceId)))
    .limit(1);
  if (!row) throw new Error("Backup nicht gefunden.");
  return row;
}

async function restore(instance: InstanceRow, payload: Payload, ctx: JobContext) {
  const ip = await requireHostIp(instance, "Wiederherstellen");
  const backup = await backupRow(instance.id, payload);
  await stopContainer(ip, ctx);

  ctx.step(`Backup ${backup.fileName} einspielen`);
  const script = restoreScript({ gameType: instance.gameType, fileName: backup.fileName });
  await runRemote(ip, script, "Wiederherstellung", { timeoutMs: 3_600_000 });

  await deployContainer(instance, ip, ctx);
}

async function deleteBackup(instance: InstanceRow, payload: Payload, ctx: JobContext) {
  const backup = await backupRow(instance.id, payload);
  const ip = await requireHostIp(instance, "Backups löschen");
  ctx.step(`Backup ${backup.fileName} löschen`);
  await runRemote(ip, `rm -f ${HOST_BACKUPS}/${shq(backup.fileName)}`, "Backup löschen");
  await db.delete(gameBackups).where(eq(gameBackups.id, backup.id));
}

async function resizeVolume(instance: InstanceRow, payload: Payload, ctx: JobContext) {
  const volume = await getVolume(instance.id);
  if (!volume) throw new Error("Es gibt noch keinen Speicher – starte den Server einmal.");
  const sizeGb = Math.round(Number(payload.sizeGb));
  if (!Number.isFinite(sizeGb) || sizeGb <= volume.sizeGb) {
    throw new Error(`Neue Größe muss größer als ${volume.sizeGb} GB sein (Verkleinern ist nicht möglich).`);
  }
  ctx.step(`Speicher auf ${sizeGb} GB vergrößern`);
  await hetznerClient.resizeVolume(volume.hetznerVolumeId, sizeGb);
  await db.update(infraVolumes).set({ sizeGb }).where(eq(infraVolumes.id, volume.id));

  const server = await getActiveServer(instance.id);
  if (server?.ipV4 && volume.linuxDevice) {
    ctx.step("Dateisystem erweitern");
    await runRemote(server.ipV4, `resize2fs ${shq(volume.linuxDevice)}`, "resize2fs", { timeoutMs: 600_000 });
  }
}

async function wipe(instance: InstanceRow, ctx: JobContext) {
  const ip = await requireHostIp(instance, "Zurücksetzen");
  if (await containerExists(ip)) await createBackup(instance, ip, "vor-reset", ctx);
  await stopContainer(ip, ctx);
  ctx.step("Spieldaten löschen");
  await runRemote(ip, `find ${HOST_DATA} -mindepth 1 -delete`, "Daten löschen", { timeoutMs: 600_000 });
  await deployContainer(instance, ip, ctx);
}

async function hibernate(instance: InstanceRow, payload: Payload, ctx: JobContext) {
  await setInstance(instance.id, { desiredState: "offline" });
  const server = await getActiveServer(instance.id);
  if (server?.ipV4) {
    const reachable = await executeRemoteCommand(server.ipV4, "true", { timeoutMs: 20_000 }).then(
      () => true,
      () => false
    );
    if (reachable) {
      const hadContainer = await containerExists(server.ipV4);
      // Stop first: most games write their save on a graceful shutdown, so the backup is consistent.
      await stopContainer(server.ipV4, ctx);
      if (instance.backupOnHibernate && payload.skipBackup !== true && hadContainer) {
        try {
          await createBackup(instance, server.ipV4, payload.reason === "idle" ? "auto-leerlauf" : "auto", ctx);
        } catch (error) {
          // A failed backup must not keep a paid VM running; the data stays on the volume anyway.
          ctx.log(`⚠ Backup übersprungen: ${(error as Error).message}`);
        }
      }
      await runRemote(server.ipV4, `sync; umount ${HOST_ROOT} || true`, "Speicher aushängen").catch(() => undefined);
    } else {
      ctx.log("⚠ VM per SSH nicht erreichbar – lösche sie ohne sauberes Herunterfahren.");
    }
  }
  await destroyHost(instance, ctx);
}

async function destroy(instance: InstanceRow, ctx: JobContext) {
  await cancelQueuedJobs(instance.id, ctx.jobId);
  await destroyHost(instance, ctx);

  const volume = await getVolume(instance.id);
  if (volume) {
    ctx.step("Speicher (Volume) löschen");
    try {
      const remote = await hetznerClient.getVolume(volume.hetznerVolumeId);
      if (remote.server) await hetznerClient.detachVolume(volume.hetznerVolumeId);
      await hetznerClient.deleteVolume(volume.hetznerVolumeId);
    } catch (error) {
      if (!/404|not_found/.test((error as Error).message)) throw error;
    }
    await db.update(infraVolumes).set({ status: "deleted" }).where(eq(infraVolumes.id, volume.id));
  }

  const fresh = await reloadInstance(instance.id);
  if (fresh.hetznerFirewallId) {
    ctx.step("Firewall löschen");
    await hetznerClient.deleteFirewall(fresh.hetznerFirewallId).catch((error: Error) => {
      if (!/404|not_found/.test(error.message)) throw error;
    });
  }

  await setInstance(instance.id, {
    archivedAt: new Date(),
    desiredState: "offline",
    hetznerFirewallId: null,
    // Free the slug and subdomain for new instances.
    slug: `${instance.slug}-geloescht-${instance.id}`,
    subdomain: null,
  });
}

export async function runAction(instance: InstanceRow, actionType: string, payload: Payload, ctx: JobContext) {
  switch (actionType) {
    case "start":
      return start(instance, ctx);
    case "stop":
      return stop(instance, ctx);
    case "restart":
      return restart(instance, ctx);
    case "apply":
      return apply(instance, ctx);
    case "hibernate":
    case "deleteHost":
      return hibernate(instance, payload, ctx);
    case "backup":
      return createBackup(instance, await requireHostIp(instance, "Ein Backup"), "manuell", ctx);
    case "restore":
      return restore(instance, payload, ctx);
    case "deleteBackup":
      return deleteBackup(instance, payload, ctx);
    case "resizeVolume":
      return resizeVolume(instance, payload, ctx);
    case "wipe":
      return wipe(instance, ctx);
    case "destroy":
      return destroy(instance, ctx);
    default:
      throw new Error(`Diese Aktion („${actionType}“) gibt es nicht mehr.`);
  }
}
