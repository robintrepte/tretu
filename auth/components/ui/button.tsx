import { Loader2 } from "lucide-react"
import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline"

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm shadow-accent/20",
  secondary: "bg-muted text-foreground hover:bg-border",
  outline: "border border-input bg-card text-foreground hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  danger: "bg-danger text-white hover:opacity-90",
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: "sm" | "md" | "lg"
  loading?: boolean
}

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" | "lg" = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
    size === "sm" && "h-8 px-3 text-sm",
    size === "md" && "h-10 px-4 text-[15px]",
    size === "lg" && "h-11 px-5 text-base",
    variants[variant],
    className,
  )
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
