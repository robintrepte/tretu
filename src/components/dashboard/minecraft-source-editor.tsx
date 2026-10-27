"use client";

import { Download, Loader2, Package, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FieldLabel } from "@/components/dashboard/settings-fields";
import { Hint } from "@/components/dashboard/panel";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardApi } from "@/lib/api/dashboard-client";
import {
  isModpackLoader,
  MINECRAFT_LOADERS,
  modrinthProjectKind,
  type MinecraftLoader,
  type MinecraftSource,
} from "@/lib/games/minecraft-source";
import { cn } from "@/lib/utils";

type VersionLists = { latestRelease: string; versions: Record<string, string[]> };
type PackHit = { id: string; slug: string; title: string; description: string; downloads: number; iconUrl: string | null };
type PackVersion = { id: string; name: string; versionNumber: string; gameVersions: string[] };
type ProjectHit = { projectId: string; slug: string; title: string; description: string; downloads: number; iconUrl: string | null };

function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const compactNumber = (n: number) => n.toLocaleString("de-DE", { notation: "compact", maximumFractionDigits: 1 });

function ModpackPicker({
  source,
  onChange,
  disabled,
}: {
  source: MinecraftSource;
  onChange: (next: MinecraftSource) => void;
  disabled?: boolean;
}) {
  const provider = source.loader === "curseforge" ? "curseforge" : "modrinth";
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const [hits, setHits] = useState<PackHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [versions, setVersions] = useState<PackVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const selectedPackId = source.modpack?.projectId ?? null;

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    dashboardApi<{ hits: PackHit[] }>(
      `/api/internal/dashboard/minecraft/modpacks?source=${provider}&q=${encodeURIComponent(debounced)}`
    )
      .then((d) => !cancelled && setHits(d.hits))
      .catch((e: Error) => !cancelled && setSearchError(e.message))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, provider]);

  useEffect(() => {
    if (!selectedPackId) return;
    let cancelled = false;
    setLoadingVersions(true);
    dashboardApi<{ versions: PackVersion[] }>(
      `/api/internal/dashboard/minecraft/modpack-versions?source=${provider}&id=${encodeURIComponent(selectedPackId)}`
    )
      .then((d) => !cancelled && setVersions(d.versions))
      .catch(() => !cancelled && setVersions([]))
      .finally(() => !cancelled && setLoadingVersions(false));
    return () => {
      cancelled = true;
    };
  }, [selectedPackId, provider]);

  const pickVersion = (versionId: string) => {
    const v = versions.find((x) => x.id === versionId);
    if (!v || !source.modpack) return;
    const mc = v.gameVersions.find((g) => /^\d+\.\d+/.test(g)) ?? source.version;
    onChange({ ...source, version: mc, modpack: { ...source.modpack, versionId: v.id, versionName: v.name || v.versionNumber } });
  };

  // Default to the newest version once the list is loaded.
  useEffect(() => {
    if (versions.length && source.modpack && !source.modpack.versionId) pickVersion(versions[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

  return (
    <div className="space-y-4">
      {source.modpack ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--tretu-accent)]/40 bg-[var(--tretu-accent)]/5 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <Package className="size-5 shrink-0 text-[var(--tretu-accent)]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{source.modpack.title}</p>
              <p className="text-xs text-muted-foreground">
                {source.modpack.versionName || "Version wählen"} · Minecraft {source.version}
              </p>
            </div>
          </div>
          {!disabled ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => onChange({ ...source, modpack: null })}
            >
              Anderes Modpack
            </button>
          ) : null}
        </div>
      ) : null}

      {source.modpack ? (
        <div className="space-y-2">
          <FieldLabel label="Modpack-Version" />
          {loadingVersions ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Versionen werden geladen…
            </p>
          ) : (
            <Select value={source.modpack.versionId} disabled={disabled} onValueChange={pickVersion}>
              <SelectTrigger>
                <SelectValue placeholder="Version wählen" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name || v.versionNumber}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {v.gameVersions.filter((g) => /^\d+\.\d+/.test(g)).slice(0, 3).join(", ")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Modpack auf ${provider === "curseforge" ? "CurseForge" : "Modrinth"} suchen…`}
              className="pl-9"
              disabled={disabled}
            />
          </div>
          {searchError ? <Hint tone="danger">{searchError}</Hint> : null}
          <div className="grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {searching && !hits.length ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Suche…
              </p>
            ) : null}
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...source,
                    modpack: { projectId: hit.id, slug: hit.slug, title: hit.title, versionId: "", versionName: "" },
                  })
                }
                className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition-colors hover:border-[var(--tretu-accent)]/50 hover:bg-muted/40"
              >
                {hit.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hit.iconUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Package className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{hit.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{hit.description}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Download className="size-3" /> {compactNumber(hit.downloads)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExtraProjects({
  source,
  onChange,
  disabled,
}: {
  source: MinecraftSource;
  onChange: (next: MinecraftSource) => void;
  disabled?: boolean;
}) {
  const kind = modrinthProjectKind(source.loader);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!kind || !open) return;
    let cancelled = false;
    const params = new URLSearchParams({ loader: source.loader, version: source.version, q: debounced });
    dashboardApi<{ hits: ProjectHit[] }>(`/api/internal/dashboard/minecraft/projects?${params}`)
      .then((d) => {
        if (cancelled) return;
        setHits(d.hits);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [debounced, kind, open, source.loader, source.version]);

  if (!kind) return null;
  const noun = kind.type === "plugin" ? "Plugins" : "Mods";
  const selected = new Set(source.extraProjects.map((p) => p.projectId || p.slug));

  return (
    <div className="space-y-3">
      <FieldLabel
        label={`${noun} von Modrinth`}
        help={`Werden beim Start automatisch in einer passenden Version installiert (inkl. Abhängigkeiten). Eigene ${noun} kannst du später über „Dateien“ hochladen.`}
      />
      {source.extraProjects.length ? (
        <div className="flex flex-wrap gap-2">
          {source.extraProjects.map((p) => (
            <span
              key={p.projectId || p.slug}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 py-1 pl-3 pr-1.5 text-xs"
            >
              {p.title || p.slug}
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`${p.title} entfernen`}
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() =>
                    onChange({ ...source, extraProjects: source.extraProjects.filter((x) => x !== p) })
                  }
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {!disabled ? (
        open ? (
          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`${noun} suchen…`}
                className="pl-9"
              />
            </div>
            {error ? <Hint tone="danger">{error}</Hint> : null}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {hits.map((hit) => {
                const isSelected = selected.has(hit.projectId);
                return (
                  <button
                    key={hit.projectId}
                    type="button"
                    disabled={isSelected}
                    onClick={() =>
                      onChange({
                        ...source,
                        extraProjects: [...source.extraProjects, { projectId: hit.projectId, slug: hit.slug, title: hit.title }],
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60 disabled:opacity-50"
                  >
                    {hit.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hit.iconUrl} alt="" className="size-7 rounded-md object-cover" />
                    ) : (
                      <div className="size-7 rounded-md bg-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{hit.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{hit.description}</span>
                    </span>
                    {isSelected ? (
                      <span className="text-xs text-muted-foreground">hinzugefügt</span>
                    ) : (
                      <Plus className="size-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setOpen(false)}>
              Suche schließen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-[var(--tretu-accent)]/50 hover:text-foreground"
          >
            <Plus className="size-4" /> {noun} hinzufügen
          </button>
        )
      ) : null}
    </div>
  );
}

export function MinecraftSourceEditor({
  value,
  onChange,
  curseforgeAvailable,
  disabled,
  existingWorld,
}: {
  value: MinecraftSource;
  onChange: (next: MinecraftSource) => void;
  curseforgeAvailable: boolean;
  disabled?: boolean;
  /** Show a warning about switching loaders on an existing world. */
  existingWorld?: boolean;
}) {
  const [meta, setMeta] = useState<VersionLists | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    dashboardApi<VersionLists>("/api/internal/dashboard/minecraft/meta")
      .then(setMeta)
      .catch((e: Error) => setMetaError(e.message));
  }, []);

  const versions = useMemo(() => meta?.versions[value.loader] ?? meta?.versions.vanilla ?? [], [meta, value.loader]);
  const modpack = isModpackLoader(value.loader);

  const setLoader = (loader: MinecraftLoader) => {
    if (loader === value.loader) return;
    onChange({
      loader,
      version: isModpackLoader(loader) ? value.version : "LATEST",
      modpack: null,
      // Mods and plugins are not interchangeable between loader families.
      extraProjects: modrinthProjectKind(loader)?.type === modrinthProjectKind(value.loader)?.type ? value.extraProjects : [],
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <FieldLabel label="Server-Software" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MINECRAFT_LOADERS.map((loader) => {
            const unavailable = loader.id === "curseforge" && !curseforgeAvailable;
            return (
              <button
                key={loader.id}
                type="button"
                disabled={disabled || unavailable}
                onClick={() => setLoader(loader.id)}
                title={unavailable ? "CurseForge-API-Key fehlt (Einrichtung)" : loader.description}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  value.loader === loader.id
                    ? "border-[var(--tretu-accent)] bg-[var(--tretu-accent)]/10 ring-1 ring-[var(--tretu-accent)]"
                    : "border-border/70 hover:bg-muted/40",
                  (disabled || unavailable) && "cursor-not-allowed opacity-50"
                )}
              >
                <span className="block text-sm font-semibold">{loader.label}</span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  {unavailable ? "CurseForge-Key in der Einrichtung hinterlegen" : loader.description}
                </span>
              </button>
            );
          })}
        </div>
        {existingWorld ? (
          <Hint tone="warning">
            Ein Wechsel der Software oder ein Downgrade kann bestehende Welten beschädigen. Vorher ein Backup machen; bei
            Modpack-Wechseln die Daten am besten zurücksetzen.
          </Hint>
        ) : null}
      </div>

      {modpack ? (
        <ModpackPicker source={value} onChange={onChange} disabled={disabled} />
      ) : (
        <div className="space-y-2">
          <FieldLabel label="Minecraft-Version" help="„Neueste“ aktualisiert den Server automatisch bei jedem Start." />
          {metaError ? <Hint tone="danger">{metaError}</Hint> : null}
          <Select value={value.version} disabled={disabled || !meta} onValueChange={(v) => onChange({ ...value, version: v })}>
            <SelectTrigger className="sm:max-w-xs">
              <SelectValue placeholder={meta ? "Version wählen" : "Lade Versionen…"} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="LATEST">Neueste ({meta?.latestRelease ?? "…"})</SelectItem>
              {versions.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ExtraProjects source={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}
