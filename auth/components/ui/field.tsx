import type { InputHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:opacity-60 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  )
}

export function Field({ label, htmlFor, hint, error, children, action }: { label: ReactNode; htmlFor: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
