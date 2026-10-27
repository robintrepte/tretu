"use client";

import {
  ChevronRight,
  Download,
  File,
  Folder,
  FolderPlus,
  Home,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useInstance } from "@/components/dashboard/instance/instance-context";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dashboardApi } from "@/lib/api/dashboard-client";
import { formatBytes, formatDateTime } from "@/lib/dashboard/format";

type Entry = { name: string; type: "dir" | "file" | "link"; size: number; modifiedAt: string };

const EDITABLE = /\.(txt|properties|json|json5|ya?ml|toml|cfg|conf|ini|log|md|sh|mcmeta|snbt|js|zs|xml|csv|env)$/i;

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

export function FilesTab() {
  const { detail, can } = useInstance();
  const base = `/api/internal/dashboard/instances/${detail.id}/files`;
  const hostUp = Boolean(detail.ip);
  const writable = can("instances:files");

  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ path: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await dashboardApi<{ path: string; items: Entry[] }>(`${base}?op=list&path=${encodeURIComponent(path)}`);
        setEntries(res.items);
        setDir(res.path);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [base]
  );

  useEffect(() => {
    if (hostUp) void load("");
  }, [hostUp, load]);

  const op = async (json: Record<string, unknown>, success: string) => {
    try {
      await dashboardApi(base, { method: "POST", json });
      toast.success(success);
      await load(dir);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  const openEditor = async (path: string) => {
    try {
      const res = await dashboardApi<{ content: string }>(`${base}?op=read&path=${encodeURIComponent(path)}`);
      setEditor({ path, content: res.content });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const res = await fetch(`${base}?path=${encodeURIComponent(join(dir, file.name))}`, { method: "PUT", body: file });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Upload fehlgeschlagen (${res.status})`);
        }
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    setUploading(null);
    toast.success("Upload abgeschlossen");
    if (uploadRef.current) uploadRef.current.value = "";
    await load(dir);
  };

  if (!hostUp) return <Hint>Dateien sind erreichbar, solange der Server läuft.</Hint>;

  const crumbs = dir ? dir.split("/") : [];

  return (
    <Panel
      title="Dateien"
      description="Mods, Plugins, Welten und Konfigurationen. Änderungen an laufenden Spielen werden meist erst nach einem Neustart aktiv."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => load(dir)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
          {writable ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setNewFolder("")}>
                <FolderPlus /> Ordner
              </Button>
              <Button size="sm" onClick={() => uploadRef.current?.click()} disabled={Boolean(uploading)}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {uploading ? `Lädt ${uploading}…` : "Hochladen"}
              </Button>
              <input ref={uploadRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            </>
          ) : null}
        </>
      }
    >
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => load("")} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted">
          <Home className="size-3.5" /> data
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => load(crumbs.slice(0, i + 1).join("/"))}
              className="rounded-md px-1.5 py-0.5 hover:bg-muted"
            >
              {c}
            </button>
          </span>
        ))}
      </nav>

      {error ? <Hint tone="danger">{error}</Hint> : null}

      <div className="overflow-hidden rounded-xl border border-border/60">
        {entries.length === 0 && !loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Ordner ist leer.</p>
        ) : null}
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => {
            const path = join(dir, entry.name);
            return (
              <li key={entry.name} className="group flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                {entry.type === "dir" ? (
                  <Folder className="size-4 shrink-0 text-amber-500" />
                ) : (
                  <File className="size-4 shrink-0 text-muted-foreground" />
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() =>
                    entry.type === "dir" ? load(path) : EDITABLE.test(entry.name) && writable ? openEditor(path) : undefined
                  }
                >
                  {entry.name}
                </button>
                <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {entry.type === "dir" ? "" : formatBytes(entry.size)}
                </span>
                <span className="hidden w-32 text-right text-xs text-muted-foreground md:block">{formatDateTime(entry.modifiedAt)}</span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-70 group-hover:opacity-100">
                  {entry.type !== "dir" && writable ? (
                    <a
                      href={`${base}?op=download&path=${encodeURIComponent(path)}`}
                      className="rounded-md p-1.5 hover:bg-muted"
                      title="Herunterladen"
                    >
                      <Download className="size-3.5" />
                    </a>
                  ) : null}
                  {writable ? (
                    <>
                      <button
                        type="button"
                        className="rounded-md p-1.5 hover:bg-muted"
                        title="Umbenennen / verschieben"
                        onClick={() => setRename({ from: path, to: path })}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-red-600 hover:bg-red-500/10"
                        title="Löschen"
                        onClick={() => {
                          if (window.confirm(`„${entry.name}“ wirklich löschen?`)) {
                            void op({ op: "delete", path }, "Gelöscht");
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && !saving && setEditor(null)}>
        <DialogContent className="rounded-2xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{editor?.path}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editor?.content ?? ""}
            onChange={(e) => setEditor((ed) => (ed ? { ...ed, content: e.target.value } : ed))}
            className="h-[60vh] font-mono text-xs"
            spellCheck={false}
          />
          {detail.gameType === "minecraft" && editor?.path === "server.properties" ? (
            <Hint tone="warning">
              Werte, die im Dashboard unter „Einstellungen“ gepflegt werden (z. B. MOTD, Spieler, Schwierigkeit), überschreiben
              diese Datei beim nächsten Start.
            </Hint>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>
              Abbrechen
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                if (!editor) return;
                setSaving(true);
                const okSaved = await op({ op: "write", path: editor.path, content: editor.content }, "Gespeichert");
                setSaving(false);
                if (okSaved) setEditor(null);
              }}
            >
              {saving ? <Loader2 className="animate-spin" /> : null} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolder !== null} onOpenChange={(open) => !open && setNewFolder(null)}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Neuer Ordner</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={newFolder ?? ""} onChange={(e) => setNewFolder(e.target.value)} placeholder="Name" />
          <DialogFooter>
            <Button
              disabled={!newFolder?.trim()}
              onClick={async () => {
                if (await op({ op: "mkdir", path: join(dir, newFolder!.trim()) }, "Ordner angelegt")) setNewFolder(null);
              }}
            >
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rename)} onOpenChange={(open) => !open && setRename(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Umbenennen / verschieben</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={rename?.to ?? ""}
            onChange={(e) => setRename((r) => (r ? { ...r, to: e.target.value } : r))}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">Pfad relativ zum Datenordner, z. B. „mods/alt/meinmod.jar“.</p>
          <DialogFooter>
            <Button
              disabled={!rename?.to.trim() || rename.to === rename.from}
              onClick={async () => {
                if (rename && (await op({ op: "rename", path: rename.from, to: rename.to.trim() }, "Umbenannt"))) setRename(null);
              }}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
