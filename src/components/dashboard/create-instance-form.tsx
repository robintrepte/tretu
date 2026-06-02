"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dashboardApiErrorMessage, readDashboardJson } from "@/lib/api/dashboard-client";
import { JVM_OS_HEADROOM_GB, hetznerServerRamGb } from "@/lib/hetzner/server-memory";

type GameOption = {
  value: string;
  label: string;
  defaultServerType: string;
  serverTypes: string[];
  supportsModpacks: boolean;
};

type MinecraftMeta = {
  vanilla: string[];
  paper: string[];
  forge: string[];
  latestRelease: string;
  sources?: Record<string, string>;
};

type ModpackSource = "modrinth" | "curseforge";

type ModpackHit = {
  id: string;
  slug: string;
  title: string;
  downloads: number;
  serverSide: string;
  source: ModpackSource;
};

type ModpackVersionRow = {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  primaryFile: { url: string; filename: string };
  source: ModpackSource;
};

const gameOptions: GameOption[] = [
  { value: "minecraft", label: "Minecraft", defaultServerType: "cpx42", serverTypes: ["cpx31", "cpx42", "cpx51"], supportsModpacks: true },
  { value: "ark", label: "ARK: Survival Evolved", defaultServerType: "cpx42", serverTypes: ["cpx42", "cpx51"], supportsModpacks: false },
  { value: "satisfactory", label: "Satisfactory", defaultServerType: "cpx42", serverTypes: ["cpx42", "cpx51"], supportsModpacks: false },
  { value: "spaceengineers", label: "Space Engineers", defaultServerType: "cpx42", serverTypes: ["cpx42", "cpx51"], supportsModpacks: false },
  { value: "cs2", label: "CS2", defaultServerType: "cpx31", serverTypes: ["cpx31", "cpx42"], supportsModpacks: false },
  { value: "arma3", label: "ArmA 3", defaultServerType: "cpx42", serverTypes: ["cpx42", "cpx51"], supportsModpacks: true },
  { value: "arma2", label: "ArmA 2", defaultServerType: "cpx42", serverTypes: ["cpx42", "cpx51"], supportsModpacks: true },
];

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{children}</p>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateInstanceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gameType, setGameType] = useState("minecraft");
  const [flavor, setFlavor] = useState<"vanilla" | "paper" | "forge" | "modpack">("paper");
  const [version, setVersion] = useState("");
  const [region, setRegion] = useState("fsn1");
  const [serverType, setServerType] = useState("cpx42");
  const [startImmediately, setStartImmediately] = useState(false);
  const [idleDeleteAfterMinutes, setIdleDeleteAfterMinutes] = useState(120);
  const [submitting, setSubmitting] = useState(false);

  const [mcMeta, setMcMeta] = useState<MinecraftMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [modpackSource, setModpackSource] = useState<ModpackSource>("modrinth");
  const [modpackQuery, setModpackQuery] = useState("");
  const [modpackHits, setModpackHits] = useState<ModpackHit[]>([]);
  const [modpackLoading, setModpackLoading] = useState(false);
  const [selectedModpack, setSelectedModpack] = useState<ModpackHit | null>(null);
  const [modpackVersions, setModpackVersions] = useState<ModpackVersionRow[]>([]);
  const [modpackVersionId, setModpackVersionId] = useState("");

  const selectedGame = useMemo(
    () => gameOptions.find((g) => g.value === gameType) ?? gameOptions[0],
    [gameType]
  );

  const versionsForFlavor = useMemo(() => {
    if (!mcMeta) return [];
    if (flavor === "vanilla") return mcMeta.vanilla;
    if (flavor === "paper") return mcMeta.paper;
    if (flavor === "forge") return mcMeta.forge;
    return [];
  }, [mcMeta, flavor]);

  const minecraftVersionSelectValue = useMemo(() => {
    if (versionsForFlavor.length === 0) return null;
    if (versionsForFlavor.includes(version)) return version;
    return versionsForFlavor[0];
  }, [versionsForFlavor, version]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/internal/dashboard/minecraft/meta");
        const payload = (await readDashboardJson(res)) as { data?: MinecraftMeta; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            typeof payload.error === "string" && payload.error.trim()
              ? payload.error.trim()
              : dashboardApiErrorMessage(res, payload as Record<string, unknown>);
          setMetaError(msg);
          toast.error(msg);
          return;
        }
        if (payload.data) {
          setMcMeta(payload.data);
          setVersion((v) => v || payload.data!.latestRelease);
        }
      } catch {
        if (!cancelled) {
          const msg = "Versionen konnten nicht geladen werden.";
          setMetaError(msg);
          toast.error(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (flavor === "modpack" || !mcMeta || versionsForFlavor.length === 0) return;
    if (!versionsForFlavor.includes(version)) {
      setVersion(versionsForFlavor[0] ?? mcMeta.latestRelease);
    }
  }, [flavor, mcMeta, versionsForFlavor, version]);

  useEffect(() => {
    if (flavor !== "modpack") {
      setSelectedModpack(null);
      setModpackVersions([]);
      setModpackVersionId("");
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setModpackLoading(true);
        try {
          const res = await fetch(
            `/api/internal/dashboard/minecraft/modpacks?q=${encodeURIComponent(modpackQuery)}&limit=40&source=${modpackSource}`
          );
          const payload = (await readDashboardJson(res)) as { data?: { hits: ModpackHit[] } };
          if (res.ok && payload.data?.hits) {
            setModpackHits(payload.data.hits);
          } else {
            setModpackHits([]);
            if (!res.ok) {
              toast.error(dashboardApiErrorMessage(res, payload as Record<string, unknown>));
            }
          }
        } catch {
          setModpackHits([]);
          toast.error("Modpacksuche fehlgeschlagen – bitte erneut versuchen.");
        } finally {
          setModpackLoading(false);
        }
      })();
    }, 320);
    return () => window.clearTimeout(t);
  }, [modpackQuery, flavor, modpackSource]);

  const loadModpackVersions = useCallback(async (id: string, source: ModpackSource) => {
    try {
      const res = await fetch(
        `/api/internal/dashboard/minecraft/modpack-versions?id=${encodeURIComponent(id)}&source=${source}`
      );
      const payload = (await readDashboardJson(res)) as { data?: { versions: ModpackVersionRow[] } };
      if (res.ok && payload.data?.versions) {
        setModpackVersions(payload.data.versions);
        const first = payload.data.versions[0];
        setModpackVersionId(first?.id ?? "");
      } else {
        setModpackVersions([]);
        setModpackVersionId("");
        if (!res.ok) {
          toast.error(dashboardApiErrorMessage(res, payload as Record<string, unknown>));
        }
      }
    } catch {
      setModpackVersions([]);
      setModpackVersionId("");
      toast.error("Modpack-Versionen konnten nicht geladen werden.");
    }
  }, []);

  const onGameChange = (value: string) => {
    setGameType(value);
    const option = gameOptions.find((g) => g.value === value);
    if (option) setServerType(option.defaultServerType);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      if (gameType === "minecraft" && flavor === "modpack" && !modpackVersionId) {
        toast.error("Bitte ein Modpack und eine Version wählen.");
        return;
      }

      const baseSlug = slugify(name || selectedGame.label);
      const slug = `${baseSlug}-${Date.now().toString().slice(-5)}`;
      const modList: string[] = [];

      const effectiveMcVersion =
        gameType === "minecraft" && flavor !== "modpack"
          ? minecraftVersionSelectValue ?? version
          : version;

      const configProfile =
        gameType === "minecraft" && flavor === "modpack"
          ? {
              flavor,
              modpackSource,
              modrinthProjectId: modpackSource === "modrinth" ? selectedModpack?.id : undefined,
              modrinthVersionId: modpackSource === "modrinth" ? modpackVersionId : undefined,
              curseforgeModId: modpackSource === "curseforge" ? selectedModpack?.id : undefined,
              curseforgeFileId: modpackSource === "curseforge" ? modpackVersionId : undefined,
              mods: modList,
            }
          : gameType === "minecraft"
            ? {
                flavor,
                minecraftVersion: effectiveMcVersion,
                mods: modList,
                modpack: null,
              }
            : {
                modpack: null,
                mods: modList,
              };

      const createRes = await fetch("/api/internal/dashboard/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: name.trim(),
          gameType,
          region,
          desiredState: startImmediately ? "running" : "offline",
          activeServerType: serverType,
          configProfile,
          idleDeleteAfterMinutes,
        }),
      });

      const createBody = await readDashboardJson(createRes);

      if (!createRes.ok) {
        toast.error(dashboardApiErrorMessage(createRes, createBody));
        return;
      }

      const created = createBody as { data?: { id?: number } };
      const instanceId = created.data?.id;
      if (instanceId === undefined || !Number.isFinite(instanceId)) {
        toast.error("Instanz wurde angelegt, aber ohne gültige ID – bitte Admin informieren.");
        return;
      }

      toast.success("Instanz wurde angelegt.");
      router.push(`/dashboard/games/${instanceId}`);
      router.refresh();
    } catch {
      toast.error("Unbekannter Fehler beim Speichern.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-border/80 bg-card p-5 shadow-md sm:p-8 dark:bg-card/80"
    >
      <FieldHint>
        Zuerst wird nur dein dauerhafter Speicher angelegt. Der Spiel-Server startet später, wenn du ihn hochfährst (dafür
        muss im Hintergrund der zugehörige Dienst laufen).
      </FieldHint>

      <div className="space-y-2">
        <Label htmlFor="instance-name">Name der Instanz</Label>
        <Input
          id="instance-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={3}
          placeholder="z.B. Minecraft Main"
          autoComplete="off"
        />
        <FieldHint>So heißt der Server bei dir in der Liste. Es wird automatisch ein kurzer Zusatzname mit erzeugt.</FieldHint>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="game-type">Spiel</Label>
          <Select value={gameType} onValueChange={onGameChange}>
            <SelectTrigger id="game-type" className="w-full">
              <SelectValue placeholder="Spiel wählen" />
            </SelectTrigger>
            <SelectContent>
              {gameOptions.map((game) => (
                <SelectItem key={game.value} value={game.value}>
                  {game.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint>Welches Spiel dieser Eintrag sein soll.</FieldHint>
        </div>
        <div className="space-y-2">
          <Label htmlFor="server-type">Größe des Servers</Label>
          <Select value={serverType} onValueChange={setServerType}>
            <SelectTrigger id="server-type" className="w-full">
              <SelectValue placeholder="Größe wählen" />
            </SelectTrigger>
            <SelectContent>
              {selectedGame.serverTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.toUpperCase()} · {hetznerServerRamGb(type)} GB RAM
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint>
            Wie leistungsstark der Server ist, wenn er läuft: größer = meist flüssiger Spielbetrieb, aber auch höhere Kosten
            pro Stunde.
            {gameType === "minecraft" ? (
              <>
                {" "}
                Für Minecraft wird der Arbeitsspeicher fürs Spiel automatisch an diese Stärke angepasst (ein kleiner Teil
                bleibt frei fürs System, ca. {JVM_OS_HEADROOM_GB} GB).
              </>
            ) : null}
          </FieldHint>
        </div>
      </div>

      {gameType !== "minecraft" ? (
        <FieldHint>
          Bei anderen Spielen wird vorerst nur der Eintrag vorbereitet; vollautomatische Einrichtung kommt nach und nach
          dazu.
        </FieldHint>
      ) : null}

      {gameType === "minecraft" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="mc-flavor">Server-Software</Label>
              <Select value={flavor} onValueChange={(v) => setFlavor(v as typeof flavor)}>
                <SelectTrigger id="mc-flavor" className="w-full">
                  <SelectValue placeholder="Software wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vanilla">Vanilla (Mojang)</SelectItem>
                  <SelectItem value="paper">Paper</SelectItem>
                  <SelectItem value="forge">Forge</SelectItem>
                  <SelectItem value="modpack">Modpack</SelectItem>
                </SelectContent>
              </Select>
              <FieldHint>
                Vanilla ist normales Minecraft. Paper ist oft angenehmer für Server. Forge ist für viele Mods. Modpack
                heißt: du suchst ein fertiges Paket (meist als ZIP) und wir richten es ein.
              </FieldHint>
            </div>

            {flavor !== "modpack" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mc-version">Minecraft-Version</Label>
                {minecraftVersionSelectValue ? (
                  <Select
                    value={minecraftVersionSelectValue}
                    onValueChange={setVersion}
                    disabled={!mcMeta || versionsForFlavor.length === 0}
                  >
                    <SelectTrigger id="mc-version" className="w-full">
                      <SelectValue placeholder="Version wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {versionsForFlavor.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="border-input text-muted-foreground flex h-9 items-center rounded-md border border-dashed px-3 text-sm">
                    {mcMeta ? "Keine Versionen verfügbar." : "Lade Versionen…"}
                  </div>
                )}
                {metaError ? <p className="text-xs text-destructive">{metaError}</p> : null}
                {!metaError ? (
                  <FieldHint>
                    Du siehst nur Versionen, die für deine Auswahl wirklich angeboten werden (bei Paper zum Beispiel nur,
                    wenn ein fertiger Download existiert).
                  </FieldHint>
                ) : null}
              </div>
            ) : (
              <div className="sm:col-span-2 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="modpack-source">Modpack-Seite</Label>
                  <Select value={modpackSource} onValueChange={(v) => setModpackSource(v as ModpackSource)}>
                    <SelectTrigger id="modpack-source" className="w-full">
                      <SelectValue placeholder="Quelle" />
                    </SelectTrigger>
                    <SelectContent>
                  <SelectItem value="modrinth">Modrinth</SelectItem>
                  <SelectItem value="curseforge">CurseForge</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldHint>
                    Modrinth geht für dich direkt. CurseForge funktioniert nur, wenn auf dem System ein API-Schlüssel
                    hinterlegt ist (machen die Admins).
                  </FieldHint>
                  <Label htmlFor="modpack-query">Modpacks suchen</Label>
                  <Input
                    id="modpack-query"
                    value={modpackQuery}
                    onChange={(e) => setModpackQuery(e.target.value)}
                    placeholder="z.B. all the mods, fabric, forge…"
                    autoComplete="off"
                  />
                  <FieldHint>
                    Suchbegriff eingeben, ein Paket in der Liste antippen, dann die passende Version wählen. Am
                    einfachsten: Server-Pack als <strong>ZIP</strong>. Reine .mrpack-Dateien gehen hier noch nicht.
                  </FieldHint>
                </div>
                {modpackLoading ? <p className="text-xs text-muted-foreground">Suche…</p> : null}
                <ul
                  className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm"
                  role="listbox"
                  aria-label="Modpack-Suchergebnisse"
                >
                  {modpackHits.map((h) => (
                    <li key={`${h.source}-${h.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedModpack(h);
                          void loadModpackVersions(h.id, h.source);
                        }}
                        className={`w-full rounded px-2 py-1 text-left hover:bg-muted ${
                          selectedModpack?.id === h.id && selectedModpack?.source === h.source
                            ? "bg-muted font-medium"
                            : ""
                        }`}
                      >
                        {h.title}{" "}
                        <span className="text-muted-foreground">
                          ({h.downloads.toLocaleString("de-DE")} DL, {h.source})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedModpack ? (
                  <div className="space-y-2">
                    <Label htmlFor="modpack-version">Version ({selectedModpack.title})</Label>
                    {modpackVersions.length > 0 ? (
                      <Select value={modpackVersionId} onValueChange={setModpackVersionId}>
                        <SelectTrigger id="modpack-version" className="w-full">
                          <SelectValue placeholder="Datei wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {modpackVersions.map((mv) => (
                            <SelectItem key={`${mv.source}-${mv.id}`} value={mv.id}>
                              {mv.versionNumber} – {mv.primaryFile.filename}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="border-input text-muted-foreground flex h-9 items-center rounded-md border border-dashed px-3 text-sm">
                        Keine Versionen geladen.
                      </div>
                    )}
                    <FieldHint>
                      Diese Datei wird heruntergeladen und auf deinem Speicher vorbereitet, damit der Server starten kann.
                    </FieldHint>
                  </div>
                ) : null}
              </div>
            )}

          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="region">Region</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger id="region" className="w-full">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fsn1">FSN1</SelectItem>
              <SelectItem value="nbg1">NBG1</SelectItem>
              <SelectItem value="hel1">HEL1</SelectItem>
            </SelectContent>
          </Select>
          <FieldHint>
            In welchem Land/Rechenzentrum der Server steht – gern nah dran, wo die meisten Spieler:innen sind.
          </FieldHint>
        </div>
        <div className="space-y-2">
          <Label htmlFor="idle-delete">Server nach Inaktivität abschalten (Minuten)</Label>
          <Input
            id="idle-delete"
            type="number"
            min={0}
            max={10080}
            value={idleDeleteAfterMinutes}
            onChange={(e) => setIdleDeleteAfterMinutes(Number(e.target.value || 0))}
          />
          <FieldHint>
            Angabe in Minuten: Nach welcher Ruhezeit der laufende Server wieder abgeschaltet werden soll, um laufende Kosten
            zu sparen. Welten und Einstellungen bleiben normalerweise auf dem Speicher erhalten.
          </FieldHint>
        </div>
      </div>

      <div className="flex items-start gap-3 space-y-0">
        <Checkbox
          id="start-immediately"
          checked={startImmediately}
          onCheckedChange={(v) => setStartImmediately(v === true)}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor="start-immediately" className="cursor-pointer font-normal text-muted-foreground">
            Direkt nach dem Anlegen den Server starten
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Der Server wird hochgefahren und das Spiel eingerichtet bzw. gestartet, sobald der Speicher fertig ist (dauert
            etwas).
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          type="submit"
          disabled={submitting}
          className="w-full bg-[var(--tretu-accent)] hover:bg-[var(--tretu-accent-hover)] text-white"
        >
          {submitting ? "Wird erstellt..." : "Instanz erstellen"}
        </Button>
        <FieldHint>
          Wenn du speichern darfst, landet der neue Server in der Übersicht. Einige Schritte danach laufen im Hintergrund und
          können kurz dauern.
        </FieldHint>
      </div>
    </form>
  );
}
