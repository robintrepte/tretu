import { CreateInstanceForm } from "@/components/dashboard/create-instance-form";
import { GameThumbnail } from "@/components/dashboard/game-thumbnail";

export default function DashboardNewInstancePage() {
  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)] sm:items-stretch">
          <div className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Neue Instanz</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              Speichern legt zuerst dauerhaften Speicher für Welten und Daten an. Bei Minecraft wählst du zum Beispiel
              Vanilla, Paper, Forge oder ein Modpack. Damit Start und Einrichtung automatisch laufen, muss das im
              Hintergrund vorbereitet sein (Zugänge und Schlüssel richten die Admins ein).
            </p>
          </div>
          <div className="hidden min-h-[140px] border-t border-border/60 sm:block sm:border-l sm:border-t-0">
            <GameThumbnail gameType="minecraft" size="banner" className="h-full min-h-[140px]" />
          </div>
        </div>
      </div>

      <CreateInstanceForm />
    </section>
  );
}
