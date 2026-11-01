import { CircleAlert, CircleCheck, Info } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Alert({ tone = "info", children, className }: { tone?: "info" | "error" | "success"; children: ReactNode; className?: string }) {
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : Info
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-lg px-3.5 py-3 text-sm leading-relaxed",
        tone === "error" && "bg-danger-soft text-danger",
        tone === "success" && "bg-success-soft text-success",
        tone === "info" && "bg-accent-soft text-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
