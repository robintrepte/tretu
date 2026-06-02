import { desc, eq, isNull } from "drizzle-orm";

import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { GameCard } from "@/components/dashboard/game-card";
import { db } from "@/db";
import { gameInstances, infraServers, instanceStatusSnapshots } from "@/db/schema";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const instances = db.select().from(gameInstances).where(isNull(gameInstances.archivedAt)).all();

  const data = instances.map((instance) => {
    const server = db
      .select()
      .from(infraServers)
      .where(eq(infraServers.instanceId, instance.id))
      .orderBy(desc(infraServers.createdAt))
      .get();
    const latest = db
      .select()
      .from(instanceStatusSnapshots)
      .where(eq(instanceStatusSnapshots.instanceId, instance.id))
      .orderBy(desc(instanceStatusSnapshots.createdAt))
      .get();

    return {
      id: instance.id,
      name: instance.name,
      gameType: instance.gameType,
      status: (latest?.infraStatus ?? "offline") as
        | "running"
        | "offline"
        | "provisioning"
        | "deleting"
        | "error",
      playerCount: latest?.playerCount ?? null,
      ip: server?.ipV4 ?? null,
    };
  });

  return (
    <section>
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 shadow-sm backdrop-blur-sm dark:bg-card/25 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Game-Server</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Welten und Einstellungen bleiben gespeichert. Der laufende Server kann bei Bedarf neu gestartet werden – du
          verlierst nicht automatisch Fortschritt.
        </p>
      </div>

      {data.length === 0 ? (
        <DashboardEmptyState />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </section>
  );
}
