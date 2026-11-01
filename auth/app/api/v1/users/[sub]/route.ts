import { apiError, verifyAdminRequest } from "@/lib/tretu/admin-api"
import { getUserShape } from "@/lib/users"

export const dynamic = "force-dynamic"

/** GET /api/v1/users/{sub} — the user shape of contract §2. */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/users/[sub]">) {
  const verified = await verifyAdminRequest(request)
  if (verified instanceof Response) return verified
  const { sub } = await params
  if (sub.length > 64) return apiError(404, "not_found")
  const shape = await getUserShape(sub)
  return shape ? Response.json(shape) : apiError(404, "not_found")
}
