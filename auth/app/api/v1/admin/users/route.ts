import { z } from "zod"
import { db } from "@/lib/db"
import { adminRead } from "@/lib/admin/http"
import { decodeCursor, SEARCH_LIMIT_MAX, searchUsers } from "@/lib/admin/users"
import { apiError } from "@/lib/tretu/admin-api"

export const dynamic = "force-dynamic"

const query = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).optional(),
  cursor: z.string().max(400).optional(),
})

/** GET /api/v1/admin/users?q=&limit=50&cursor= — search Tretu-Konten (lib/admin/users.ts). */
export async function GET(request: Request) {
  const read = await adminRead(request)
  if (read instanceof Response) return read
  const params = query.safeParse(Object.fromEntries([...read.url.searchParams].filter(([key]) => key !== "actorSub")))
  if (!params.success) return apiError(400, "invalid_request", z.prettifyError(params.error))
  const cursor = params.data.cursor ? decodeCursor(params.data.cursor) : null
  if (params.data.cursor && !cursor) return apiError(400, "invalid_request", "cursor is invalid")
  return Response.json(await searchUsers(db, { q: params.data.q, limit: params.data.limit, cursor }))
}
