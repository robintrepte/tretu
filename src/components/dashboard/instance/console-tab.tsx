"use client";

import { Loader2, RefreshCw, Send } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("dashboard.console");
  const tCommon = useTranslations("dashboard.common");
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
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 5000);
    return () => clearInterval(timer);
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
      setHistory((h) => [...h.slice(-30), { command: cmd, output: res.output || t("noOutput") }]);
      setCommand("");
      setTimeout(() => void load(), 1000);
    } catch (error) {
      setHistory((h) => [...h.slice(-30), { command: cmd, output: (error as Error).message, error: true }]);
    } finally {
      setSending(false);
    }
  };

  if (!hostUp) {
    return <Hint>{t("onlyWhenRunning")}</Hint>;
  }

  return (
    <div className="space-y-5">
      <Panel
        title={t("log")}
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={follow} onCheckedChange={(c) => setFollow(c === true)} /> {t("live")}
            </label>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} {tCommon("refresh")}
            </Button>
          </>
        }
      >
        {note ? <Hint>{note}</Hint> : null}
        <pre
          ref={logRef}
          className="h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-200"
        >
          {logs || t("noLogs")}
        </pre>
      </Panel>

      {def?.features.console ? (
        <Panel
          title={t("sendTitle")}
          description={detail.gameType === "minecraft" ? t("hintMinecraft") : t("hintRcon")}
        >
          {!can("instances:console") ? (
            <Hint>{t("noPermission")}</Hint>
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
                  placeholder={t("placeholder")}
                  className="font-mono"
                  disabled={sending}
                />
                <Button type="submit" disabled={sending || !command.trim()}>
                  {sending ? <Loader2 className="animate-spin" /> : <Send />} {t("send")}
                </Button>
              </form>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
