/**
 * Outage alerts for tretu.de/status: a short German message to a Discord webhook
 * (`TRETU_STATUS_DISCORD_WEBHOOK_URL`) only when a service changes state. A service counts as down or disturbed
 * after 2 consecutive checks with that state (a single blip never alerts) and as recovered with the first good
 * check after an announced problem.
 */
import { log } from "@/lib/observability/logger";
import type { CheckResult, ServiceState } from "@/lib/status/check";

/** Consecutive bad checks before a problem is announced. */
export const ALERT_AFTER_CHECKS = 2;

export type ServiceRow = {
  state: ServiceState;
  since: Date;
  consecutive: number;
  alertedState: ServiceState;
  alertedAt: Date | null;
};

export type StateChange = {
  kind: "down" | "degraded" | "recovered";
  /** When the announced problem started (for "läuft wieder nach …"). */
  problemSince: Date | null;
  error: string | null;
};

function isState(value: string): value is ServiceState {
  return value === "up" || value === "degraded" || value === "down";
}

/** Pure state machine: the service row after one check and the alert to send, if any. */
export function nextServiceState(prev: ServiceRow | null, result: CheckResult, at: Date): { row: ServiceRow; change: StateChange | null } {
  const same = prev !== null && prev.state === result.state;
  const row: ServiceRow = {
    state: result.state,
    since: same ? prev.since : at,
    consecutive: same ? prev.consecutive + 1 : 1,
    // A service seen for the first time is assumed to have been fine (its first problem is announced as usual).
    alertedState: prev && isState(prev.alertedState) ? prev.alertedState : "up",
    alertedAt: prev?.alertedAt ?? null,
  };
  let change: StateChange | null = null;
  if (result.state === "up") {
    if (row.alertedState !== "up") {
      change = { kind: "recovered", problemSince: row.alertedAt, error: null };
      row.alertedState = "up";
      row.alertedAt = at;
    }
  } else if (row.consecutive >= ALERT_AFTER_CHECKS && row.alertedState !== result.state) {
    // The problem started with the first of the consecutive bad checks; keep that start for down ↔ degraded.
    const problemSince = row.alertedState === "up" ? row.since : (row.alertedAt ?? row.since);
    change = { kind: result.state, problemSince, error: result.error };
    row.alertedState = result.state;
    row.alertedAt = problemSince;
  }
  return { row, change };
}

const REASONS: Record<string, string> = {
  timeout: "keine Antwort innerhalb von 5 Sekunden",
  connection: "keine Verbindung",
  invalid_json: "unerwartete Antwort",
  invalid_response: "unerwartete Antwort",
  slow: "antwortet sehr langsam",
};

/** German description of a check error code. */
export function describeError(error: string | null): string | null {
  if (!error) return null;
  if (REASONS[error]) return REASONS[error];
  if (error.startsWith("http_")) return `HTTP ${error.slice(5)}`;
  if (error.startsWith("checks:")) return `Prüfung fehlgeschlagen: ${error.slice(7).replace(/,/g, ", ")}`;
  if (error.startsWith("status:")) return `meldet „${error.slice(7)}“`;
  return null;
}

/** "5 Min.", "2 Std. 10 Min.", "3 Tg. 4 Std." */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} Std. ${minutes % 60} Min.` : `${hours} Std.`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} Tg. ${hours % 24} Std.` : `${days} Tg.`;
}

/** The Discord message (plain text, no mentions). */
export function alertMessage(service: { name: string; host: string }, change: StateChange, at: Date, pageUrl: string): string {
  const who = `**${service.name}** (${service.host})`;
  const reason = describeError(change.error);
  switch (change.kind) {
    case "down":
      return `${who} ist ausgefallen${reason ? ` – ${reason}` : ""}. ${pageUrl}`;
    case "degraded":
      return `${who} ist gestört${reason ? ` – ${reason}` : ""}. ${pageUrl}`;
    case "recovered":
      return `${who} läuft wieder${change.problemSince ? ` (nach ${formatDuration(at.getTime() - change.problemSince.getTime())})` : ""}.`;
  }
}

/** Only real Discord webhook URLs are used (the URL itself is a secret: never logged). */
export function discordWebhookUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.TRETU_STATUS_DISCORD_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const okHost = /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/.test(url.hostname);
    if (url.protocol === "https:" && okHost && url.pathname.startsWith("/api/webhooks/")) return url.toString();
  } catch {
    // reported below
  }
  log("error", "status.discord_webhook_invalid", { hint: "expected https://discord.com/api/webhooks/<id>/<token>" });
  return null;
}

/** Posts one message. Never throws; returns whether Discord accepted it. */
export async function postDiscord(webhookUrl: string, content: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) log("warn", "status.discord_failed", { status: response.status });
    return response.ok;
  } catch (error) {
    log("warn", "status.discord_failed", { error: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
