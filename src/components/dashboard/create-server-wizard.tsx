"use client";

import { ArrowLeft, Loader2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { GameThumbnail } from "@/components/dashboard/game-thumbnail";
import { MinecraftSourceEditor } from "@/components/dashboard/minecraft-source-editor";
import { Hint, Panel } from "@/components/dashboard/panel";
import { recommendedServerType, ServerTypePicker } from "@/components/dashboard/server-type-picker";
import { FieldLabel, SettingsFields } from "@/components/dashboard/settings-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardApi } from "@/lib/api/dashboard-client";
import { formatEuro } from "@/lib/dashboard/format";
import { defaultSettings, GAME_CATALOG, type GameDefinition, type SettingValues } from "@/lib/games/catalog";
import type { MinecraftSource } from "@/lib/games/minecraft-source";
import type { HetznerOptions } from "@/lib/hetzner/types";
import { cn } from "@/lib/utils";

export const IDLE_OPTIONS = [
  { value: "0", label: "Nie automatisch ausschalten" },
  { value: "15", label: "Nach 15 Minuten ohne Spieler" },
  { value: "30", label: "Nach 30 Minuten ohne Spieler" },
  { value: "60", label: "Nach 1 Stunde ohne Spieler" },
  { value: "120", label: "Nach 2 Stunden ohne Spieler" },
  { value: "240", label: "Nach 4 Stunden ohne Spieler" },
];

const DEFAULT_MINECRAFT: MinecraftSource = { loader: "paper", version: "LATEST", modpack: null, extraProjects: [] };

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "server"
  );
}

type Options = HetznerOptions & { defaultLocation: string };

export function CreateServerWizard({
  cloudflareDomain,
  curseforgeAvailable,
}: {
  cloudflareDomain: string | null;
  curseforgeAvailable: boolean;
}) {
  const router = useRouter();
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [settings, setSettings] = useState<SettingValues>({});
  const [minecraft, setMinecraft] = useState<MinecraftSource>(DEFAULT_MINECRAFT);
  const [location, setLocation] = useState("");
  const [serverType, setServerType] = useState("");
  const [volumeGb, setVolumeGb] = useState(20);
  const [idleMinutes, setIdleMinutes] = useState("30");
  const [startNow, setStartNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modpacks need noticeably more memory than plain servers.
  const modpack = game?.id === "minecraft" && (minecraft.loader === "modrinth" || minecraft.loader === "curseforge");
  const recommendedRamGb = game ? (modpack ? Math.max(game.recommendedRamGb, 12) : game.recommendedRamGb) : 0;

  useEffect(() => {
    dashboardApi<Options>("/api/internal/dashboard/hetzner/options")
      .then((o) => {
        setOptions(o);
        setLocation((l) => l || o.defaultLocation);
      })
      .catch((e: Error) => setOptionsError(e.message));
  }, []);

  const selectGame = (def: GameDefinition) => {
    setGame(def);
    setName(`Tretu ${def.label.replace(/ \(.*\)$/, "")}`);
    setSettings(defaultSettings(def));
    setVolumeGb(def.defaultVolumeGb);
    setIdleMinutes(def.features.playerCount ? "30" : "0");
    setSubdomainTouched(false);
    setServerType("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (!subdomainTouched) setSubdomain(slugify(name));
  }, [name, subdomainTouched]);

  // Pick the recommended size whenever game or location changes.
  useEffect(() => {
    if (!game || !options || !location) return;
    const current = options.serverTypes.find((t) => t.name === serverType);
    if (current?.availableIn.includes(location) && current.memoryGb >= Math.min(recommendedRamGb, game.minRamGb * 2)) return;
    const rec = recommendedServerType(options, location, recommendedRamGb, game.minRamGb);
    if (rec) setServerType(rec);
  }, [game, options, location, serverType, recommendedRamGb]);

  // Modpacks: allow flight (jetpacks etc.) unless the user changed it.
  useEffect(() => {
    if (modpack) setSettings((s) => ({ ...s, allowFlight: true }));
  }, [modpack]);

  const price = useMemo(() => {
    const type = options?.serverTypes.find((t) => t.name === serverType);
    return type?.prices[location] ?? null;
  }, [options, serverType, location]);

  const submit = async () => {
    if (!game) return;
    setSubmitting(true);
    try {
      const { id } = await dashboardApi<{ id: number }>("/api/internal/dashboard/instances", {
        method: "POST",
        json: {
          gameType: game.id,
          name,
          subdomain: cloudflareDomain ? subdomain : undefined,
          region: location,
          serverType,
          volumeSizeGb: volumeGb,
          idleMinutes: Number(idleMinutes),
          settings,
          minecraft: game.id === "minecraft" ? minecraft : undefined,
          startNow,
        },
      });
      toast.success(startNow ? "Server angelegt – wird jetzt gestartet." : "Server angelegt.");
      router.push(`/dashboard/games/${id}`);
    } catch (error) {
      toast.error((error as Error).message);
      setSubmitting(false);
    }
  };

  if (!game) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAME_CATALOG.map((def) => (
          <button
            key={def.id}
            type="button"
            disabled={!def.available}
            onClick={() => selectGame(def)}
            className={cn(
              "group relative overflow-hidden rounded-2xl border border-border/80 bg-card text-left shadow-sm transition-all",
              def.available
                ? "hover:-translate-y-0.5 hover:border-[var(--tretu-accent)]/40 hover:shadow-md"
                : "cursor-not-allowed opacity-50 grayscale"
            )}
          >
            <GameThumbnail gameType={def.id} size="md" />
            {!def.available ? (
              <span className="absolute right-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                Bald verfügbar
              </span>
            ) : null}
            <div className="p-4">
              <h3 className="font-semibold tracking-tight">{def.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{def.tagline}</p>
              <p className="mt-3 text-xs text-muted-foreground">ab {def.minRamGb} GB RAM · empfohlen {def.recommendedRamGb} GB</p>
            </div>
          </button>
        ))}
      </div>
    );
  }

  const hostname = cloudflareDomain && subdomain ? `${subdomain}.${cloudflareDomain}` : null;
  const canSubmit = Boolean(name.trim().length >= 2 && serverType && location && !submitting);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setGame(null)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Anderes Spiel wählen
      </button>

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="grid sm:grid-cols-[180px_1fr]">
          <GameThumbnail gameType={game.id} size="md" className="min-h-28 sm:min-h-full" />
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div className="space-y-2">
              <FieldLabel htmlFor="server-name" label="Name im Dashboard" />
              <Input id="server-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </div>
            {cloudflareDomain ? (
              <div className="space-y-2">
                <FieldLabel htmlFor="server-subdomain" label="Adresse für Spieler" />
                <div className="flex items-center gap-1.5">
                  <Input
                    id="server-subdomain"
                    value={subdomain}
                    onChange={(e) => {
                      setSubdomainTouched(true);
                      setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    className="font-mono"
                  />
                  <span className="shrink-0 font-mono text-sm text-muted-foreground">.{cloudflareDomain}</span>
                </div>
              </div>
            ) : (
              <Hint>
                Ohne Cloudflare-Anbindung verbinden sich Spieler über die IP-Adresse (sie ändert sich bei jedem Einschalten).
              </Hint>
            )}
          </div>
        </div>
      </div>

      {game.id === "minecraft" ? (
        <Panel title="Minecraft-Version & Mods" description="Alles wird beim Start automatisch heruntergeladen und eingerichtet.">
          <MinecraftSourceEditor value={minecraft} onChange={setMinecraft} curseforgeAvailable={curseforgeAvailable} />
        </Panel>
      ) : null}

      <Panel title="Spiel-Einstellungen" description="Kannst du später jederzeit ändern.">
        <SettingsFields
          fields={game.settings}
          values={settings}
          onChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
        />
        {game.notes?.length ? (
          <div className="mt-4 space-y-2">
            {game.notes.map((n) => (
              <Hint key={n}>{n}</Hint>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title="Leistung & Standort" description="Der Server läuft auf einer eigenen Hetzner-VM. Bezahlt wird nur die Laufzeit.">
        {optionsError ? <Hint tone="danger">{optionsError}</Hint> : null}
        {!options ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Lade Servertypen und Preise von Hetzner…
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <FieldLabel label="Standort" />
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.locations.map((l) => (
                      <SelectItem key={l.name} value={l.name}>
                        {l.city} ({l.country}) · {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="volume" label="Speicher für Welten (GB)" />
                <Input
                  id="volume"
                  type="number"
                  min={game.minVolumeGb}
                  max={2000}
                  value={volumeGb}
                  onChange={(e) => setVolumeGb(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Automatisch ausschalten" />
                <Select value={idleMinutes} onValueChange={setIdleMinutes} disabled={!game.features.playerCount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IDLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ServerTypePicker
              options={options}
              location={location}
              value={serverType}
              onChange={setServerType}
              minRamGb={game.minRamGb}
              recommendedRamGb={recommendedRamGb}
            />
          </div>
        )}
      </Panel>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card/95 p-4 shadow-lg backdrop-blur sm:p-5">
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-semibold tabular-nums">{formatEuro(price?.hourly ?? null, 3)}</span>
            <span className="text-muted-foreground"> pro Stunde Laufzeit</span>
            {options?.volumePricePerGbMonth ? (
              <span className="text-muted-foreground">
                {" "}
                + {formatEuro(options.volumePricePerGbMonth * volumeGb)} / Monat Speicher
              </span>
            ) : null}
          </p>
          {hostname ? <p className="font-mono text-xs text-muted-foreground">{hostname}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={startNow} onCheckedChange={(c) => setStartNow(c === true)} />
            Direkt starten
          </label>
          <Button
            size="lg"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-xl bg-[var(--tretu-accent)] text-white shadow-md hover:bg-[var(--tretu-accent-hover)]"
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Rocket />}
            Server erstellen
          </Button>
        </div>
      </div>
    </div>
  );
}
