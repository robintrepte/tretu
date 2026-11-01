import { ArrowUpRight } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Card, CardHeader } from "@/components/ui/card"

const APPS = [
  { id: "tretu", name: "tretu.de", url: "https://tretu.de", color: "#ed6f1a" },
  { id: "saga", name: "Saga", url: "https://saga.tretu.de", color: "#7c3aed" },
  { id: "play", name: "Play", url: "https://play.tretu.de", color: "#0ea5e9" },
  { id: "hollowmere", name: "Hollowmere", url: "https://hollowmere.tretu.de", color: "#16a34a" },
  { id: "mc", name: "Minecraft", url: "https://mc.tretu.de", color: "#65a30d" },
] as const

export async function AppsOverview() {
  const t = await getTranslations("account.apps")
  return (
    <Card>
      <CardHeader title={t("title")} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {APPS.map((app) => (
          <li key={app.id}>
            <a
              href={app.url}
              className="group flex items-center gap-3 rounded-xl border p-3.5 transition-colors hover:border-accent/50 hover:bg-muted/50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: app.color }}>
                {app.name[0]!.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{app.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{t(app.id)}</span>
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-label={t("open")} />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  )
}
