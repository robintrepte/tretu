import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur-sm dark:bg-card/40 sm:p-6",
        className
      )}
    >
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Hint({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed",
        tone === "neutral" && "border-border/60 bg-muted/40 text-muted-foreground dark:bg-muted/20",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        tone === "danger" && "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
      )}
    >
      {children}
    </div>
  );
}
