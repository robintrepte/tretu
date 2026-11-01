import type { ReactNode } from "react"
import { BrandMark } from "@/components/brand"
import { SiteFooter } from "@/components/site-footer"

/** The centred card every sign-in page uses. */
export function AuthShell({ title, subtitle, children, below }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; below?: ReactNode }) {
  return (
    <div className="tretu-backdrop flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col items-center px-4 pt-10 sm:pt-16">
        <div className="mb-8">
          <BrandMark href="/login" />
        </div>
        <div className="w-full max-w-[420px] rounded-2xl border bg-card p-6 shadow-xl shadow-black/[0.04] sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {below && <div className="mt-5 text-center text-sm text-muted-foreground">{below}</div>}
      </main>
      <SiteFooter />
    </div>
  )
}
