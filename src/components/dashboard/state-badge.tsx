import { STATE_PRESENTATION, type OverallState, type Tone } from "@/lib/dashboard/status";
import { cn } from "@/lib/utils";

export const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  neutral: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  success: { badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  warning: { badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  danger: { badge: "bg-red-500/15 text-red-700 dark:text-red-300", dot: "bg-red-500" },
  info: { badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
};

export function StateBadge({
  state,
  label,
  className,
}: {
  state: OverallState;
  /** Overrides the default label (e.g. the running job). */
  label?: string;
  className?: string;
}) {
  const p = STATE_PRESENTATION[state];
  const tone = TONE_CLASSES[p.tone];
  const pulsing = state === "busy" || state === "starting" || state === "online";
  return (
    <span
      title={p.hint}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tone.badge, className)}
    >
      <span className="relative flex size-2">
        {pulsing ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", tone.dot)} /> : null}
        <span className={cn("relative inline-flex size-2 rounded-full", tone.dot)} />
      </span>
      {label ?? p.label}
    </span>
  );
}
