/** Client-safe status vocabulary of the dashboard. */

export type GameStatus = "running" | "starting" | "stopped" | "crashed" | "unreachable";

export type OverallState = "offline" | "busy" | "starting" | "online" | "stopped" | "crashed" | "unreachable";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const STATE_PRESENTATION: Record<OverallState, { label: string; tone: Tone; hint: string }> = {
  offline: {
    label: "Aus",
    tone: "neutral",
    hint: "Keine VM aktiv – kostet nur den Speicher. Welt & Einstellungen bleiben erhalten.",
  },
  busy: { label: "Arbeitet…", tone: "info", hint: "Eine Aktion läuft gerade." },
  starting: { label: "Startet…", tone: "warning", hint: "Der Spielserver lädt noch. Das kann einige Minuten dauern." },
  online: { label: "Online", tone: "success", hint: "Der Server ist erreichbar." },
  stopped: {
    label: "Spiel gestoppt",
    tone: "warning",
    hint: "Die VM läuft (und kostet), das Spiel ist aus. Starten oder ausschalten.",
  },
  crashed: { label: "Fehler", tone: "danger", hint: "Der Spielserver ist abgestürzt oder antwortet nicht. Logs prüfen." },
  unreachable: { label: "Nicht erreichbar", tone: "danger", hint: "Die VM antwortet nicht per SSH." },
};
