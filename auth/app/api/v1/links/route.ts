import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { audit } from "@/lib/audit"
import { db } from "@/lib/db"
import { externalLink, user } from "@/lib/db/schema"
import { apiError, parseJson, verifyAdminRequest } from "@/lib/tretu/admin-api"
import { emitUserEvent } from "@/lib/tretu/events"

export const dynamic = "force-dynamic"

const provider = z.enum(["minecraft", "steam"])
const linkBody = z.object({
  sub: z.string().min(1).max(64),
  provider,
  providerAccountId: z.string().trim().min(1).max(64),
  displayName: z.string().trim().max(64).nullish(),
})
const unlinkBody = z.object({ sub: z.string().min(1).max(64), provider })

/** Minecraft UUIDs are stored lowercase with dashes, so the same player is never linked twice. */
function normalizeAccountId(kind: "minecraft" | "steam", id: string): string | null {
  if (kind === "steam") return /^\d{1,20}$/.test(id) ? id : null
  const hex = id.toLowerCase().replace(/-/g, "")
  if (!/^[0-9a-f]{32}$/.test(hex)) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** POST /api/v1/links — link a Minecraft or Steam account to a Tretu ID (contract §2). */
export async function POST(request: Request) {
  const verified = await verifyAdminRequest(request)
  if (verified instanceof Response) return verified
  const parsed = linkBody.safeParse(parseJson(verified.body))
  if (!parsed.success) return apiError(400, "invalid_request", z.prettifyError(parsed.error))
  const input = parsed.data
  const accountId = normalizeAccountId(input.provider, input.providerAccountId)
  if (!accountId) return apiError(400, "invalid_request", "providerAccountId has the wrong format")

  const owner = await db.query.user.findFirst({ where: eq(user.id, input.sub), columns: { id: true } })
  if (!owner) return apiError(404, "not_found")

  const result = await db.transaction(async (tx) => {
    const taken = await tx.query.externalLink.findFirst({
      where: and(eq(externalLink.provider, input.provider), eq(externalLink.providerAccountId, accountId)),
    })
    if (taken && taken.userId !== input.sub) return "conflict" as const
    const current = await tx.query.externalLink.findFirst({ where: and(eq(externalLink.userId, input.sub), eq(externalLink.provider, input.provider)) })
    const displayName = input.displayName ?? null
    if (current) {
      if (current.providerAccountId === accountId && current.displayName === displayName) return "unchanged" as const
      await tx.update(externalLink).set({ providerAccountId: accountId, displayName }).where(eq(externalLink.id, current.id))
    } else {
      await tx.insert(externalLink).values({ userId: input.sub, provider: input.provider, providerAccountId: accountId, displayName })
    }
    return "changed" as const
  })
  if (result === "conflict") return apiError(409, "conflict", "This account is linked to another Tretu ID")
  if (result === "changed") {
    await audit("link.added", { userId: input.sub, meta: { provider: input.provider, by: verified.app } })
    await emitUserEvent("user.updated", input.sub)
  }
  return Response.json({ ok: true })
}

/** DELETE /api/v1/links — remove a Minecraft or Steam link. */
export async function DELETE(request: Request) {
  const verified = await verifyAdminRequest(request)
  if (verified instanceof Response) return verified
  const parsed = unlinkBody.safeParse(parseJson(verified.body))
  if (!parsed.success) return apiError(400, "invalid_request", z.prettifyError(parsed.error))
  const removed = await db
    .delete(externalLink)
    .where(and(eq(externalLink.userId, parsed.data.sub), eq(externalLink.provider, parsed.data.provider)))
    .returning({ id: externalLink.id })
  if (removed.length) {
    await audit("link.removed", { userId: parsed.data.sub, meta: { provider: parsed.data.provider, by: verified.app } })
    await emitUserEvent("user.updated", parsed.data.sub)
  }
  return Response.json({ ok: true })
}
