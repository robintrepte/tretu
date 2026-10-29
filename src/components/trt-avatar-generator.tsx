"use client";

import {
  ArrowDownUp,
  Bookmark,
  Check,
  Copy,
  Dices,
  Download,
  Link2,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AVATAR_PRESETS,
  buildAvatarSvg,
  configFromParams,
  configToParams,
  DEFAULT_AVATAR,
  isHexColor,
  randomAvatarConfig,
  type AvatarConfig,
  type GradientDirection,
} from "@/lib/trt-avatar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "trt-avatar-gallery";
const MAX_SAVED = 40;

type SavedAvatar = { id: string; name: string; config: AvatarConfig; createdAt: number };

const DIRECTIONS: Array<{ value: GradientDirection; label: string }> = [
  { value: "vertical", label: "Vertikal" },
  { value: "diagonal", label: "Diagonal" },
  { value: "horizontal", label: "Horizontal" },
  { value: "radial", label: "Radial" },
];

const EXPORT_SIZES = [256, 512, 1080, 2048];

function svgDataUrl(config: AvatarConfig, size: number) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildAvatarSvg(config, size))}`;
}

function renderPng(config: AvatarConfig, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas nicht verfügbar"));
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export fehlgeschlagen"))), "image/png");
    };
    img.onerror = () => reject(new Error("Bild konnte nicht erzeugt werden"));
    img.src = svgDataUrl(config, size);
  });
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileBase(name: string) {
  const clean = name.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return clean ? `TRT-${clean}` : "TRT-Avatar";
}

function loadGallery(): SavedAvatar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedAvatar[]) : [];
  } catch {
    return [];
  }
}

function storeGallery(items: SavedAvatar[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    toast.error("Speichern im Browser nicht möglich.");
  }
}

function sameConfig(a: AvatarConfig, b: AvatarConfig) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
      />
      <Input
        aria-label={`${label} (Hex)`}
        value={text}
        maxLength={7}
        className="font-mono uppercase"
        onChange={(e) => {
          const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
          setText(v);
          if (isHexColor(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TrtAvatarGenerator() {
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [name, setName] = useState("");
  const [round, setRound] = useState(false);
  const [exportSize, setExportSize] = useState(1080);
  const [gallery, setGallery] = useState<SavedAvatar[]>([]);
  const [busy, setBusy] = useState(false);

  // Restore from a share link, then load the personal gallery.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = configFromParams(params);
    if (fromUrl) setConfig(fromUrl);
    if (params.get("n")) setName(params.get("n")!.slice(0, 40));
    setGallery(loadGallery());
  }, []);

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = configToParams(config);
      if (name.trim()) params.set("n", name.trim());
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    }, 250);
    return () => clearTimeout(t);
  }, [config, name]);

  const preview = useMemo(() => svgDataUrl(config, 1080), [config]);
  const update = (patch: Partial<AvatarConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const setColor = (index: number, value: string) =>
    setConfig((c) => ({ ...c, colors: c.colors.map((col, i) => (i === index ? value : col)) }));

  const exportPng = useCallback(async () => {
    setBusy(true);
    try {
      download(await renderPng(config, exportSize), `${fileBase(name)}.png`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [config, exportSize, name]);

  const exportSvg = () =>
    download(new Blob([buildAvatarSvg(config, exportSize)], { type: "image/svg+xml" }), `${fileBase(name)}.svg`);

  const copyImage = async () => {
    try {
      const blob = await renderPng(config, exportSize);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Bild in die Zwischenablage kopiert");
    } catch {
      toast.error("Kopieren wird von diesem Browser nicht unterstützt – bitte herunterladen.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link kopiert – damit kann jeder genau diesen Avatar öffnen.");
    } catch {
      toast.error("Link konnte nicht kopiert werden.");
    }
  };

  const saveToGallery = () => {
    const item: SavedAvatar = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || "Ohne Namen",
      config,
      createdAt: Date.now(),
    };
    const next = [item, ...gallery].slice(0, MAX_SAVED);
    setGallery(next);
    storeGallery(next);
    toast.success("In „Meine Avatare“ gespeichert");
  };

  const removeFromGallery = (id: string) => {
    const next = gallery.filter((g) => g.id !== id);
    setGallery(next);
    storeGallery(next);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      {/* Preview */}
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="mx-auto w-full max-w-[560px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Vorschau des TRT-Avatars"
            className={cn(
              "aspect-square w-full shadow-xl ring-1 ring-black/10 transition-[border-radius] dark:ring-white/10",
              round ? "rounded-full" : "rounded-2xl"
            )}
          />
        </div>
        <div className="mx-auto flex max-w-[560px] flex-wrap items-center justify-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-card p-1 text-sm">
            {[
              { value: false, label: "Quadrat" },
              { value: true, label: "Rund (Discord/TS)" },
            ].map((o) => (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => setRound(o.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 transition-colors",
                  round === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2" aria-label="Kleine Vorschau">
            {[64, 40, 24].map((s) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s} src={preview} alt="" width={s} height={s} className={round ? "rounded-full" : "rounded-md"} />
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-7 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm sm:p-6">
        <Section title="Vorlagen">
          <div className="grid grid-cols-7 gap-2">
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                onClick={() => setConfig({ ...preset.config, colors: [...preset.config.colors] })}
                className={cn(
                  "overflow-hidden rounded-lg ring-offset-2 ring-offset-background transition-transform hover:scale-105",
                  sameConfig(preset.config, config) && "ring-2 ring-[var(--tretu-accent)]"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgDataUrl(preset.config, 96)} alt="" className="aspect-square w-full" />
              </button>
            ))}
          </div>
          <Button variant="outline" className="w-full" onClick={() => setConfig((c) => randomAvatarConfig(c))}>
            <Dices /> Zufall
          </Button>
        </Section>

        <Section
          title="Hintergrund"
          action={
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Farben umdrehen"
                aria-label="Farben umdrehen"
                onClick={() => update({ colors: [...config.colors].reverse() })}
              >
                <ArrowDownUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Farbe hinzufügen"
                aria-label="Farbe hinzufügen"
                disabled={config.colors.length >= 4}
                onClick={() => update({ colors: [...config.colors, config.colors[config.colors.length - 1]] })}
              >
                <Plus />
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            {config.colors.map((color, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <ColorField label={`Farbe ${i + 1}`} value={color} onChange={(v) => setColor(i, v)} />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Farbe ${i + 1} entfernen`}
                  disabled={config.colors.length <= 1}
                  onClick={() => update({ colors: config.colors.filter((_, j) => j !== i) })}
                >
                  <Minus />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-background/60 p-1 text-xs">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => update({ direction: d.value })}
                className={cn(
                  "rounded-lg px-2 py-1.5 transition-colors",
                  config.direction === d.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Logo">
          <ColorField label="Logo-Farbe" value={config.logoColor} onChange={(v) => update({ logoColor: v })} />
          <div className="flex gap-2">
            {[
              { color: "#ffffff", label: "Weiß" },
              { color: "#111111", label: "Schwarz" },
              { color: "#ed6f1a", label: "Tretu-Orange" },
            ].map((o) => (
              <button
                key={o.color}
                type="button"
                onClick={() => update({ logoColor: o.color })}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                <span className="size-3 rounded-full ring-1 ring-black/20" style={{ background: o.color }} />
                {o.label}
                {config.logoColor === o.color ? <Check className="size-3" /> : null}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="glow" className="flex justify-between">
              Leuchten <span className="tabular-nums text-muted-foreground">{Math.round(config.glow * 100)} %</span>
            </Label>
            <input
              id="glow"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={config.glow}
              onChange={(e) => update({ glow: Number(e.target.value) })}
              className="w-full accent-[var(--tretu-accent)]"
            />
          </div>
        </Section>

        <Section title="Speichern">
          <div className="space-y-2">
            <Label htmlFor="avatar-name">Name (für den Dateinamen)</Label>
            <Input
              id="avatar-name"
              value={name}
              maxLength={40}
              placeholder="z. B. DovahChief"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Größe</span>
            <div className="grid flex-1 grid-cols-4 gap-1 rounded-xl border border-border bg-background/60 p-1 text-xs">
              {EXPORT_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setExportSize(s)}
                  className={cn(
                    "rounded-lg py-1.5 tabular-nums transition-colors",
                    exportSize === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}px
                </button>
              ))}
            </div>
          </div>
          <Button
            size="lg"
            disabled={busy}
            onClick={exportPng}
            className="w-full rounded-xl bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
          >
            <Download /> PNG herunterladen
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={saveToGallery}>
              <Bookmark /> Merken
            </Button>
            <Button variant="outline" onClick={copyImage}>
              <Copy /> Bild kopieren
            </Button>
            <Button variant="outline" onClick={copyLink}>
              <Link2 /> Link teilen
            </Button>
            <Button variant="outline" onClick={exportSvg}>
              <Download /> SVG
            </Button>
          </div>
        </Section>
      </div>

      {gallery.length ? (
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight">Meine Avatare</h2>
          <p className="text-sm text-muted-foreground">Gespeichert in diesem Browser. Klicken zum Bearbeiten.</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {gallery.map((item) => (
              <div key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setConfig(item.config);
                    setName(item.name === "Ohne Namen" ? "" : item.name);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="block w-full text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={svgDataUrl(item.config, 160)} alt="" className="aspect-square w-full rounded-xl shadow-sm" />
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{item.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`${item.name} löschen`}
                  onClick={() => removeFromGallery(item.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1.5 opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="size-3.5 text-red-600" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
