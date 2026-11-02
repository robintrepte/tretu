import { db } from "@/lib/db"
import { adminRead, notFound, targetSub } from "@/lib/admin/http"
import { getAdminUserDetail } from "@/lib/admin/users"

export const dynamic = "force-dynamic"

/** GET /api/v1/admin/users/{sub} — everything the central admin shows about one Tretu-Konto. */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/admin/users/[sub]">) {
  const read = await adminRead(request)
  if (read instanceof Response) return read
  const sub = targetSub((await params).sub)
  const detail = sub ? await getAdminUserDetail(db, sub) : null
  return detail ? Response.json(detail) : notFound()
}
