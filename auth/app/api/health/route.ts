import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import pkg from "@/package.json"

export const dynamic = "force-dynamic"

/** Contract §0 health check: no auth, no secrets. */
export async function GET() {
  let dbStatus: "ok" | "error" = "ok"
  try {
    await Promise.race([db.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))])
  } catch {
    dbStatus = "error"
  }
  const ok = dbStatus === "ok"
  return Response.json(
    { status: ok ? "ok" : "error", app: "auth", version: pkg.version, time: new Date().toISOString(), checks: { db: dbStatus } },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  )
}
