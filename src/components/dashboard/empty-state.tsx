"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";

import { GameThumbnail } from "@/components/dashboard/game-thumbnail";
import { Button } from "@/components/ui/button";

const previewTypes = ["minecraft", "cs2", "ark", "satisfactory"] as const;

export function DashboardEmptyState() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 p-8 shadow-sm sm:p-10 dark:from-card dark:via-card dark:to-muted/15">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--tretu-accent)]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative grid gap-8 lg:grid-cols-[1fr_minmax(0,280px)] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground dark:bg-muted/20">
            <Sparkles className="h-3.5 w-3.5 text-[var(--tretu-accent)]" aria-hidden />
            Los geht&apos;s
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">Noch keine Server angelegt</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Ein Eintrag sichert Welten und Einstellungen dauerhaft; der Server selbst läuft nur, wenn du ihn brauchst. Leg
            den ersten an und wähle Spiel, Version und Standort – der Rest läuft im Hintergrund.
          </p>
          <div className="mt-6">
            <Button
              asChild
              size="lg"
              className="rounded-xl bg-[var(--tretu-accent)] px-6 hover:bg-[var(--tretu-accent-hover)] text-white shadow-md"
            >
              <Link href="/dashboard/new">Ersten Server erstellen</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3" aria-hidden>
          {previewTypes.map((type) => (
            <div
              key={type}
              className="overflow-hidden rounded-2xl border border-border/60 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
            >
              <GameThumbnail gameType={type} size="sm" className="min-h-20 sm:min-h-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
