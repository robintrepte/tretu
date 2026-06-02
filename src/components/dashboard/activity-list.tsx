import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Item = {
  id: number;
  createdAt: string;
  message: string;
  status: "queued" | "running" | "failed" | "succeeded";
};

const statusPresentation: Record<
  Item["status"],
  { label: string; variant: "secondary" | "warning" | "danger" | "success" }
> = {
  queued: { label: "Wartet", variant: "secondary" },
  running: { label: "Läuft", variant: "warning" },
  failed: { label: "Fehlgeschlagen", variant: "danger" },
  succeeded: { label: "Fertig", variant: "success" },
};

export function ActivityList({ items }: { items: Item[] }) {
  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground dark:bg-muted/10">
        Noch nichts passiert. Sobald du im Dashboard etwas auslöst, erscheint es hier mit Status.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const { label, variant } = statusPresentation[item.status];
        return (
          <li
            key={item.id}
            className={cn(
              "rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm",
              "transition-colors hover:border-border dark:bg-card/50"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{item.message}</p>
              <Badge variant={variant}>{label}</Badge>
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{item.createdAt}</p>
          </li>
        );
      })}
    </ul>
  );
}
