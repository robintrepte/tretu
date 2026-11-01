import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { avatar } from "@/lib/db/schema"

/** Uploaded profile pictures; the `picture` claim points here (with a version query for cache busting). */
export async function GET(_request: Request, { params }: RouteContext<"/api/avatar/[userId]">) {
  const { userId } = await params
  if (userId.length > 64) return new Response(null, { status: 404 })
  const row = await db.query.avatar.findFirst({ where: eq(avatar.userId, userId) })
  if (!row) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": row.contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "cross-origin-resource-policy": "cross-origin",
      "x-content-type-options": "nosniff",
    },
  })
}
