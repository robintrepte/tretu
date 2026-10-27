"use client";

import { Cpu, MemoryStick } from "lucide-react";
import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { formatEuro } from "@/lib/dashboard/format";
import type { HetznerOptions, ServerTypeOption } from "@/lib/hetzner/types";
import { cn } from "@/lib/utils";

/** Cheapest type available at the location that meets the recommended RAM. */
export function recommendedServerType(
  options: HetznerOptions,
  location: string,
  recommendedRamGb: number,
  minRamGb: number
): string | null {
  const available = options.serverTypes.filter((t) => t.availableIn.includes(location) && t.prices[location]);
  const pick = (minMemory: number) =>
    available
      .filter((t) => t.memoryGb >= minMemory)
      .sort((a, b) => a.prices[location].hourly - b.prices[location].hourly)[0];
  return (pick(recommendedRamGb) ?? pick(minRamGb))?.name ?? null;
}

export function ServerTypePicker({
  options,
  location,
  value,
  onChange,
  minRamGb,
  recommendedRamGb,
  disabled,
}: {
  options: HetznerOptions;
  location: string;
  value: string;
  onChange: (name: string) => void;
  minRamGb: number;
  recommendedRamGb: number;
  disabled?: boolean;
}) {
  const [showDedicated, setShowDedicated] = useState(false);
  const recommended = recommendedServerType(options, location, recommendedRamGb, minRamGb);

  const types = useMemo(
    () =>
      options.serverTypes.filter(
        (t) =>
          t.prices[location] &&
          t.memoryGb >= minRamGb &&
          t.memoryGb <= 64 &&
          (showDedicated || !t.dedicatedCpu || t.name === value)
      ),
    [options, location, minRamGb, showDedicated, value]
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((t: ServerTypeOption) => {
          const available = t.availableIn.includes(location);
          const selected = t.name === value;
          const price = t.prices[location];
          return (
            <button
              key={t.name}
              type="button"
              disabled={disabled || !available}
              onClick={() => onChange(t.name)}
              className={cn(
                "relative rounded-xl border p-3 text-left transition-colors",
                selected
                  ? "border-[var(--tretu-accent)] bg-[var(--tretu-accent)]/10 ring-1 ring-[var(--tretu-accent)]"
                  : "border-border/70 bg-card hover:border-border hover:bg-muted/40",
                (!available || disabled) && "cursor-not-allowed opacity-50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold uppercase">{t.name}</span>
                {t.name === recommended ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Empfohlen
                  </span>
                ) : !available ? (
                  <span className="text-[11px] text-muted-foreground">ausverkauft</span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MemoryStick className="size-3.5" /> {t.memoryGb} GB RAM
                </span>
                <span className="inline-flex items-center gap-1">
                  <Cpu className="size-3.5" /> {t.cores} vCPU{t.dedicatedCpu ? " (dediziert)" : ""}
                </span>
              </div>
              <div className="mt-2 text-sm">
                <span className="font-semibold tabular-nums">{formatEuro(price.hourly, 3)}</span>
                <span className="text-muted-foreground"> / Std.</span>
              </div>
            </button>
          );
        })}
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={showDedicated} onCheckedChange={(c) => setShowDedicated(c === true)} />
        Auch Server mit dedizierten CPUs zeigen (teurer, konstantere Leistung)
      </label>
      {recommendedRamGb > minRamGb ? (
        <p className="text-xs text-muted-foreground">
          Mindestens {minRamGb} GB RAM, empfohlen {recommendedRamGb} GB. Abgerechnet wird nur, solange der Server an ist.
        </p>
      ) : null}
    </div>
  );
}
