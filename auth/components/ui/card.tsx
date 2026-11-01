import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border bg-card p-6 shadow-sm sm:p-7", className)}>{children}</section>
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      {label && <span className="h-px flex-1 bg-border" />}
    </div>
  )
}
