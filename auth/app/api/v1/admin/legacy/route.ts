import { db } from "@/lib/db"
import { adminRead } from "@/lib/admin/http"
import { listLegacyAccounts } from "@/lib/legacy/admin"

export const dynamic = "force-dynamic"

/** GET /api/v1/admin/legacy — imported old accounts no merge touched yet, with possible matches (`npm run admin -- legacy`). */
export async function GET(request: Request) {
  const read = await adminRead(request)
  if (read instanceof Response) return read
  return Response.json({ items: await listLegacyAccounts(db) })
}
