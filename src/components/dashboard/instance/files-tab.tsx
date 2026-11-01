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
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useInstance } from "@/components/dashboard/instance/instance-context";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dashboardApi } from "@/lib/api/dashboard-client";
import { useFormat } from "@/components/dashboard/use-format";

type Entry = { name: string; type: "dir" | "file" | "link"; size: number; modifiedAt: string };

const EDITABLE = /\.(txt|properties|json|json5|ya?ml|toml|cfg|conf|ini|log|md|sh|mcmeta|snbt|js|zs|xml|csv|env)$/i;

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

export function FilesTab() {
  const t = useTranslations("dashboard.files");
  const tCommon = useTranslations("dashboard.common");
  const format = useFormat();
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
          throw new Error(body.error ?? t("uploadFailed", { status: res.status }));
        }
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    setUploading(null);
    toast.success(t("uploadDone"));
    if (uploadRef.current) uploadRef.current.value = "";
    await load(dir);
  };

  if (!hostUp) return <Hint>{t("onlyWhenRunning")}</Hint>;

  const crumbs = dir ? dir.split("/") : [];

  return (
    <Panel
      title={t("title")}
      description={t("intro")}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void load(dir)} disabled={loading} aria-label={tCommon("refresh")}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
          {writable ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setNewFolder("")}>
                <FolderPlus /> {t("folder")}
              </Button>
              <Button size="sm" onClick={() => uploadRef.current?.click()} disabled={Boolean(uploading)}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {uploading ? t("uploading", { name: uploading }) : t("upload")}
              </Button>
              <input ref={uploadRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
            </>
          ) : null}
        </>
      }
    >
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => void load("")} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted">
          <Home className="size-3.5" /> data
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => void load(crumbs.slice(0, i + 1).join("/"))}
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
          <p className="p-6 text-center text-sm text-muted-foreground">{t("emptyFolder")}</p>
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
                  onClick={() => {
                    if (entry.type === "dir") void load(path);
                    else if (EDITABLE.test(entry.name) && writable) void openEditor(path);
                  }}
                >
                  {entry.name}
                </button>
                <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {entry.type === "dir" ? "" : format.bytes(entry.size)}
                </span>
                <span className="hidden w-32 text-right text-xs text-muted-foreground md:block">{format.dateTime(entry.modifiedAt)}</span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-70 group-hover:opacity-100">
                  {entry.type !== "dir" && writable ? (
                    <a
                      href={`${base}?op=download&path=${encodeURIComponent(path)}`}
                      className="rounded-md p-1.5 hover:bg-muted"
                      title={t("download")}
                    >
                      <Download className="size-3.5" />
                    </a>
                  ) : null}
                  {writable ? (
                    <>
                      <button
                        type="button"
                        className="rounded-md p-1.5 hover:bg-muted"
                        title={t("rename")}
                        onClick={() => setRename({ from: path, to: path })}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-red-600 hover:bg-red-500/10"
                        title={t("delete")}
                        onClick={() => {
                          if (window.confirm(t("confirmDelete", { name: entry.name }))) {
                            void op({ op: "delete", path }, t("deleted"));
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
              {t("propertiesWarning")}
            </Hint>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>
              {tCommon("cancel")}
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                if (!editor) return;
                setSaving(true);
                const okSaved = await op({ op: "write", path: editor.path, content: editor.content }, t("saved"));
                setSaving(false);
                if (okSaved) setEditor(null);
              }}
            >
              {saving ? <Loader2 className="animate-spin" /> : null} {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolder !== null} onOpenChange={(open) => !open && setNewFolder(null)}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("newFolder")}</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={newFolder ?? ""} onChange={(e) => setNewFolder(e.target.value)} placeholder={t("name")} />
          <DialogFooter>
            <Button
              disabled={!newFolder?.trim()}
              onClick={async () => {
                if (await op({ op: "mkdir", path: join(dir, newFolder!.trim()) }, t("folderCreated"))) setNewFolder(null);
              }}
            >
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rename)} onOpenChange={(open) => !open && setRename(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("rename")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={rename?.to ?? ""}
            onChange={(e) => setRename((r) => (r ? { ...r, to: e.target.value } : r))}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">{t("renameHint")}</p>
          <DialogFooter>
            <Button
              disabled={!rename?.to.trim() || rename.to === rename.from}
              onClick={async () => {
                if (rename && (await op({ op: "rename", path: rename.from, to: rename.to.trim() }, t("renamed")))) setRename(null);
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
