import Link from "next/link"
import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static SVG, no optimisation needed
    <img src="/logo.svg" alt="Tretu" width={1811} height={601} className={cn("h-7 w-auto", className)} />
  )
}

export function BrandMark({ href = "/konto" }: { href?: "/konto" | "/login" }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="Tretu-Konto">
      <Logo />
      <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-background">Konto</span>
    </Link>
  )
}
