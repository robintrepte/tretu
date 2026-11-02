import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({ title, intro, actions }: { title: ReactNode; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {intro ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{intro}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A headline number (stat tile in the style of the ranking page). */
export function Kpi({ label, value, hint, testId }: { label: string; value: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-3" data-testid={testId}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function Pill({ children, tone = "neutral", testId }: { children: ReactNode; tone?: "neutral" | "accent" | "warning" | "danger" | "success"; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-border/70 bg-muted/50 text-muted-foreground",
        tone === "accent" && "border-[var(--tretu-accent)]/30 bg-[var(--tretu-accent)]/10 text-[var(--tretu-accent)]",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        tone === "danger" && "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      )}
    >
      {children}
    </span>
  );
}

/** Name + secondary line linking to the account detail page. */
export function AccountLink({ sub, name, secondary }: { sub: string; name: string | null; secondary?: string | null }) {
  return (
    <Link href={`/dashboard/admin/konten/${encodeURIComponent(sub)}`} className="group block min-w-0">
      <span className="block truncate font-medium group-hover:underline">{name || sub}</span>
      {secondary ? <span className="block truncate text-xs text-muted-foreground">{secondary}</span> : null}
    </Link>
  );
}

/** Definition list row. */
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export const inputClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
