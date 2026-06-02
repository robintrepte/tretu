import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { BackupActions } from "@/components/dashboard/backup-actions";
import { GameThumbnail } from "@/components/dashboard/game-thumbnail";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { db } from "@/db";
import { gameInstances, infraServers, instancePorts, instanceStatusSnapshots } from "@/db/schema";
import { getGameArt } from "@/lib/games/art";

export const dynamic = "force-dynamic";

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const instanceId = Number((await params).instanceId);
  if (!Number.isFinite(instanceId)) notFound();

  const instance = db
    .select()
    .from(gameInstances)
    .where(and(eq(gameInstances.id, instanceId), isNull(gameInstances.archivedAt)))
    .get();
  if (!instance) notFound();

  const server = db
    .select()
    .from(infraServers)
    .where(eq(infraServers.instanceId, instance.id))
    .orderBy(desc(infraServers.createdAt))
    .get();
  const status = db
    .select()
    .from(instanceStatusSnapshots)
    .where(eq(instanceStatusSnapshots.instanceId, instance.id))
    .orderBy(desc(instanceStatusSnapshots.createdAt))
    .get();
  const ports = db.select().from(instancePorts).where(eq(instancePorts.instanceId, instance.id)).all();

  const gameLabel = getGameArt(instance.gameType).label;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <GameThumbnail gameType={instance.gameType} size="banner" />
        <div className="p-5 sm:p-7">
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Status, Verbindung und Aktionen für diesen Server. Einige Schritte laufen im Hintergrund und können kurz
            dauern.
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{instance.name}</h1>
              <p className="mt-1 text-sm font-medium text-muted-foreground">{gameLabel}</p>
            </div>
            <StatusBadge
              status={(status?.infraStatus ?? "offline") as "running" | "offline" | "provisioning" | "deleting" | "error"}
            />
          </div>
          <div className="mt-6 space-y-4">
            <QuickActions instanceId={instance.id} />
            <BackupActions instanceId={instance.id} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/80 bg-card/80 p-5 shadow-sm backdrop-blur-sm dark:bg-card/40 sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight">Verbindung</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Öffentliche Adresse zum Verbinden und offene Ports, falls bei euch hinterlegt.
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-col gap-1 rounded-xl bg-muted/50 px-3 py-2.5 dark:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-muted-foreground">IP-Adresse</dt>
            <dd className="font-mono text-foreground">{server?.ipV4 ?? "noch nicht zugewiesen"}</dd>
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-muted/50 px-3 py-2.5 dark:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-muted-foreground">Ports</dt>
            <dd className="font-mono text-foreground">
              {ports.length ? ports.map((p) => `${p.port}/${p.protocol}`).join(", ") : "–"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
