import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { actionAttempts, actionJobs, gameInstances, infraServers, infraVolumes } from "@/db/schema";
import { getHetznerSshKeyIds, HETZNER_DEFAULT_SERVER_IMAGE, HETZNER_DEFAULT_VOLUME_GB } from "@/lib/env/server";
import { getGameAdapter } from "@/lib/games";
import { hetznerClient } from "@/lib/hetzner/client";
import { log } from "@/lib/observability/logger";

const MAX_RETRIES = 3;

type GameInstanceRow = typeof gameInstances.$inferSelect;
type InfraServerRow = typeof infraServers.$inferSelect;
type InfraVolumeRow = typeof infraVolumes.$inferSelect;

function tryEnqueueJob(input: {
  instanceId: number;
  actionType: string;
  requestedByUserId: number;
  idempotencyKey: string;
}) {
  const clash = db.select().from(actionJobs).where(eq(actionJobs.idempotencyKey, input.idempotencyKey)).get();
  if (clash) return;
  db.insert(actionJobs)
    .values({
      instanceId: input.instanceId,
      actionType: input.actionType,
      requestedByUserId: input.requestedByUserId,
      payloadJson: {},
      idempotencyKey: input.idempotencyKey,
      status: "queued",
    })
    .run();
}

async function ensureProvisionedHost(instance: GameInstanceRow): Promise<{
  server: InfraServerRow;
  volume: InfraVolumeRow;
  ip: string;
}> {
  const volumeRow = db.select().from(infraVolumes).where(eq(infraVolumes.instanceId, instance.id)).get();
  if (!volumeRow) {
    throw new Error(
      "Kein Hetzner-Volume für diese Instanz. Warte auf Abschluss der Volume-Erstellung oder versuche es später erneut."
    );
  }

  const sshKeyIds = getHetznerSshKeyIds();
  if (!sshKeyIds.length) {
    throw new Error(
      "HETZNER_SSH_KEY_IDS muss mindestens eine numerische SSH-Key-ID aus der Hetzner Cloud Console enthalten."
    );
  }

  let serverRow = db
    .select()
    .from(infraServers)
    .where(and(eq(infraServers.instanceId, instance.id), isNull(infraServers.deletedAt)))
    .get();

  if (!serverRow) {
    const { server: created } = await hetznerClient.createServer({
      name: `tretu-${instance.slug}`,
      serverType: instance.activeServerType,
      image: HETZNER_DEFAULT_SERVER_IMAGE,
      location: instance.region,
      volumeIds: [Number(volumeRow.hetznerVolumeId)],
      sshKeyIds,
    });

    const insertResult = db
      .insert(infraServers)
      .values({
        instanceId: instance.id,
        hetznerServerId: String(created.id),
        name: created.name,
        ipV4: created.public_net?.ipv4?.ip ?? null,
        status: "provisioning",
      })
      .run();

    serverRow = db
      .select()
      .from(infraServers)
      .where(eq(infraServers.id, Number(insertResult.lastInsertRowid)))
      .get()!;

    await hetznerClient.waitForServerRunning(String(created.id));
    const { server: ready } = await hetznerClient.getServer(String(created.id));
    const ip = ready.public_net?.ipv4?.ip;
    if (!ip) throw new Error("Server hat nach dem Start keine öffentliche IPv4.");

    db.update(infraServers).set({ ipV4: ip }).where(eq(infraServers.id, serverRow.id)).run();
    serverRow = db.select().from(infraServers).where(eq(infraServers.id, serverRow.id)).get()!;

    const adapter = getGameAdapter(instance.gameType);
    await adapter.provisionRuntime({
      instanceId: instance.id,
      host: ip,
      mountPath: volumeRow.mountPath,
    });

    db.update(infraVolumes).set({ status: "attached" }).where(eq(infraVolumes.id, volumeRow.id)).run();
    db.update(infraServers).set({ status: "running" }).where(eq(infraServers.id, serverRow.id)).run();
    serverRow = db.select().from(infraServers).where(eq(infraServers.id, serverRow.id)).get()!;
  } else {
    let ip = serverRow.ipV4;
    if (!ip) {
      const { server: fresh } = await hetznerClient.getServer(serverRow.hetznerServerId);
      ip = fresh.public_net?.ipv4?.ip ?? null;
      if (ip) {
        db.update(infraServers).set({ ipV4: ip }).where(eq(infraServers.id, serverRow.id)).run();
      }
    }
    serverRow = db.select().from(infraServers).where(eq(infraServers.id, serverRow.id)).get()!;
    if (!serverRow.ipV4) throw new Error("Aktiver Server hat keine öffentliche IPv4.");
  }

  const volume = db.select().from(infraVolumes).where(eq(infraVolumes.id, volumeRow.id)).get()!;
  const server = db.select().from(infraServers).where(eq(infraServers.id, serverRow.id)).get()!;
  return { server, volume, ip: server.ipV4! };
}

async function execute(jobId: number) {
  const job = db.select().from(actionJobs).where(eq(actionJobs.id, jobId)).get();
  if (!job || job.status !== "queued") return;

  db.update(actionJobs).set({ status: "running", startedAt: new Date() }).where(eq(actionJobs.id, job.id)).run();

  try {
    const instance = db.select().from(gameInstances).where(eq(gameInstances.id, job.instanceId)).get();
    if (!instance) throw new Error("Instance not found");

    const server = db
      .select()
      .from(infraServers)
      .where(and(eq(infraServers.instanceId, instance.id), isNull(infraServers.deletedAt)))
      .get();
    const volumeRow = db.select().from(infraVolumes).where(eq(infraVolumes.instanceId, instance.id)).get();
    const mountFallback = `/srv/tretu/${instance.slug}`;
    const adapter = getGameAdapter(instance.gameType);

    switch (job.actionType) {
      case "createVolume": {
        const existingVol = db.select().from(infraVolumes).where(eq(infraVolumes.instanceId, instance.id)).get();
        if (!existingVol) {
          const payload = job.payloadJson as { sizeGb?: number };
          const sizeGb =
            typeof payload.sizeGb === "number" && payload.sizeGb >= 10 ? payload.sizeGb : HETZNER_DEFAULT_VOLUME_GB;
          const mountPath = mountFallback;
          const { volume } = await hetznerClient.createVolume({
            name: `tretu-${instance.slug}`,
            sizeGb,
            location: instance.region,
            labels: {
              tretu_instance: String(instance.id),
              tretu_slug: instance.slug,
            },
          });
          db.insert(infraVolumes)
            .values({
              instanceId: instance.id,
              hetznerVolumeId: String(volume.id),
              mountPath,
              sizeGb,
              status: "available",
            })
            .run();
        }

        const refreshed = db.select().from(gameInstances).where(eq(gameInstances.id, instance.id)).get();
        if (refreshed?.desiredState === "running") {
          tryEnqueueJob({
            instanceId: instance.id,
            actionType: "start",
            requestedByUserId: job.requestedByUserId,
            idempotencyKey: `auto-start-${instance.id}`,
          });
        }
        break;
      }
      case "provision":
        await ensureProvisionedHost(instance);
        break;
      case "start": {
        const { ip, volume } = await ensureProvisionedHost(instance);
        await adapter.start({
          instanceId: instance.id,
          host: ip,
          mountPath: volume.mountPath,
        });
        break;
      }
      case "stop":
        await adapter.stop({
          instanceId: instance.id,
          host: server?.ipV4 ?? undefined,
          mountPath: volumeRow?.mountPath ?? mountFallback,
        });
        break;
      case "restart":
        await adapter.restart({
          instanceId: instance.id,
          host: server?.ipV4 ?? undefined,
          mountPath: volumeRow?.mountPath ?? mountFallback,
        });
        break;
      case "backup":
        if (!server?.hetznerServerId) throw new Error("No server to snapshot");
        await adapter.preSnapshotHook({
          instanceId: instance.id,
          host: server.ipV4 ?? undefined,
          mountPath: volumeRow?.mountPath ?? mountFallback,
        });
        await hetznerClient.createSnapshot(server.hetznerServerId, `${instance.slug}-${Date.now()}`);
        break;
      case "deleteHost":
        if (!server?.hetznerServerId) throw new Error("No active host");
        await hetznerClient.deleteServer(server.hetznerServerId);
        db.update(infraServers).set({ deletedAt: new Date(), status: "deleted" }).where(eq(infraServers.id, server.id)).run();
        if (volumeRow) {
          db.update(infraVolumes).set({ status: "available" }).where(eq(infraVolumes.id, volumeRow.id)).run();
        }
        break;
      default:
        break;
    }

    db.update(actionJobs).set({ status: "succeeded", finishedAt: new Date() }).where(eq(actionJobs.id, job.id)).run();
  } catch (error) {
    const attempts = db.select().from(actionAttempts).where(eq(actionAttempts.jobId, job.id)).all().length + 1;
    const msg = error instanceof Error ? error.message : "Unknown error";

    db.insert(actionAttempts)
      .values({
        jobId: job.id,
        attemptNo: attempts,
        status: attempts >= MAX_RETRIES ? "failed" : "retrying",
        errorMessage: msg,
        logExcerpt: msg.slice(0, 5000),
      })
      .run();

    if (attempts >= MAX_RETRIES) {
      db.update(actionJobs).set({ status: "failed", finishedAt: new Date() }).where(eq(actionJobs.id, job.id)).run();
      log("error", "job.failed", { jobId: job.id, error: msg });
    } else {
      db.update(actionJobs).set({ status: "queued" }).where(eq(actionJobs.id, job.id)).run();
      log("warn", "job.retrying", { jobId: job.id, attempt: attempts, error: msg });
    }
  }
}

export async function runOrchestratorTick() {
  const job = db.select().from(actionJobs).where(eq(actionJobs.status, "queued")).orderBy(asc(actionJobs.createdAt)).get();
  if (!job) return;
  await execute(job.id);
}
