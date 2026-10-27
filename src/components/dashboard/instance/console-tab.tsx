"use client";

import { Loader2, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useInstance } from "@/components/dashboard/instance/instance-context";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { dashboardApi } from "@/lib/api/dashboard-client";
import { getGameDefinition } from "@/lib/games/catalog";

type HistoryEntry = { command: string; output: string; error?: boolean };

export function ConsoleTab() {
  const { detail, can } = useInstance();
  const def = getGameDefinition(detail.gameType);
  const hostUp = Boolean(detail.ip);
  const [logs, setLogs] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [follow, setFollow] = useState(true);
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const logRef = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardApi<{ logs: string; note: string | null }>(
        `/api/internal/dashboard/instances/${detail.id}/logs?lines=400`
      );
      setLogs(res.logs);
      setNote(res.note);
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [detail.id]);

  useEffect(() => {
    if (!hostUp) return;
    void load();
    if (!follow) return;
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 5000);
    return () => clearInterval(t);
  }, [hostUp, follow, load]);

  useEffect(() => {
    if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, follow]);

  const send = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    setSending(true);
    try {
      const res = await dashboardApi<{ output: string }>(`/api/internal/dashboard/instances/${detail.id}/console`, {
        method: "POST",
        json: { command: cmd },
      });
      setHistory((h) => [...h.slice(-30), { command: cmd, output: res.output || "(keine Ausgabe)" }]);
      setCommand("");
      setTimeout(load, 1000);
    } catch (error) {
      setHistory((h) => [...h.slice(-30), { command: cmd, output: (error as Error).message, error: true }]);
    } finally {
      setSending(false);
    }
  };

  if (!hostUp) {
    return <Hint>Logs und Konsole sind verfügbar, sobald der Server läuft.</Hint>;
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Server-Log"
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={follow} onCheckedChange={(c) => setFollow(c === true)} /> Live
            </label>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Aktualisieren
            </Button>
          </>
        }
      >
        {note ? <Hint>{note}</Hint> : null}
        <pre
          ref={logRef}
          className="h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-200"
        >
          {logs || "Noch keine Log-Ausgabe."}
        </pre>
      </Panel>

      {def?.features.console ? (
        <Panel
          title="Befehl senden"
          description={
            detail.gameType === "minecraft"
              ? "Minecraft-Befehle ohne Schrägstrich, z. B. „say Hallo“, „op Spielername“, „whitelist add Name“."
              : "RCON-Befehle, z. B. „changelevel de_inferno“ oder „mp_restartgame 1“."
          }
        >
          {!can("instances:console") ? (
            <Hint>Du hast keine Berechtigung, Befehle zu senden.</Hint>
          ) : (
            <div className="space-y-3">
              {history.length ? (
                <div className="max-h-56 space-y-2 overflow-auto rounded-xl bg-muted/40 p-3 font-mono text-xs dark:bg-muted/20">
                  {history.map((h, i) => (
                    <div key={i}>
                      <div className="text-[var(--tretu-accent)]">&gt; {h.command}</div>
                      <div className={h.error ? "text-red-600 dark:text-red-400" : "whitespace-pre-wrap text-muted-foreground"}>
                        {h.output}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Befehl eingeben…"
                  className="font-mono"
                  disabled={sending}
                />
                <Button type="submit" disabled={sending || !command.trim()}>
                  {sending ? <Loader2 className="animate-spin" /> : <Send />} Senden
                </Button>
              </form>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
