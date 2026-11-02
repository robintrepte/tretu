import { db } from "@/lib/db"
import { adminRead } from "@/lib/admin/http"
import { getAdminStats } from "@/lib/admin/users"

export const dynamic = "force-dynamic"

/** GET /api/v1/admin/stats — account totals, sign-ups and sign-ins per day (90 days, Europe/Berlin), sign-in methods. */
export async function GET(request: Request) {
  const read = await adminRead(request)
  if (read instanceof Response) return read
  return Response.json(await getAdminStats(db))
}
