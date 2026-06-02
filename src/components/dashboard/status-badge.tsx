import { Badge } from "@/components/ui/badge";

type Status = "running" | "offline" | "provisioning" | "deleting" | "error";

const hints: Record<Status, string> = {
  running: "Server läuft laut letztem Stand.",
  offline: "Gerade nicht erreichbar oder bewusst aus.",
  provisioning: "Wird noch eingerichtet oder fährt hoch.",
  deleting: "Wird gerade abgebaut.",
  error: "Etwas stimmt nicht – Logs prüfen oder einen Admin fragen.",
};

export function StatusBadge({ status }: { status: Status }) {
  const title = hints[status];

  const inner =
    status === "running" ? (
      <Badge variant="success">Läuft</Badge>
    ) : status === "provisioning" ? (
      <Badge variant="warning">Einrichtung</Badge>
    ) : status === "deleting" ? (
      <Badge variant="warning">Wird gelöscht</Badge>
    ) : status === "error" ? (
      <Badge variant="danger">Fehler</Badge>
    ) : (
      <Badge variant="secondary">Offline</Badge>
    );

  return (
    <span title={title} className="inline-flex">
      {inner}
    </span>
  );
}
