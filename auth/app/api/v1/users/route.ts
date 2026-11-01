import { apiError, verifyAdminRequest } from "@/lib/tretu/admin-api"
import { findUserIdByUsername, getUserShape } from "@/lib/users"

export const dynamic = "force-dynamic"

/** GET /api/v1/users?username=<name> — look a user up by username (case-insensitive). */
export async function GET(request: Request) {
  const verified = await verifyAdminRequest(request)
  if (verified instanceof Response) return verified
  const username = new URL(request.url).searchParams.get("username")?.trim()
  if (!username || username.length > 64) return apiError(400, "invalid_request", "username is required")
  const id = await findUserIdByUsername(username)
  const shape = id ? await getUserShape(id) : null
  return shape ? Response.json(shape) : apiError(404, "not_found")
}
