import { z } from "zod"
import { env } from "@/lib/env"

const appsSchema = z.record(
  z.string().min(1),
  z.object({ secret: z.string().min(1), webhook: z.url().optional() }).loose(),
)

export type TretuApps = z.infer<typeof appsSchema>

export function parseApps(json: string | undefined): TretuApps {
  if (!json) return {}
  const parsed = appsSchema.safeParse(JSON.parse(json))
  if (!parsed.success) throw new Error(`TRETU_APPS_JSON is invalid: ${parsed.error.message}`)
  return parsed.data
}

let cached: Record<string, string> | undefined

/** app id → signing secret, from TRETU_APPS_JSON (empty when unset: the admin API then rejects everything). */
export function appSecrets(): Record<string, string> {
  if (!cached) cached = Object.fromEntries(Object.entries(parseApps(env.TRETU_APPS_JSON)).map(([id, app]) => [id, app.secret]))
  return cached
}
