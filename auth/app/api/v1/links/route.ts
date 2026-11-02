import { randomUUID } from "node:crypto"
import { and, eq, ne, sql } from "drizzle-orm"
import { z } from "zod"
import { audit } from "@/lib/audit"
import { db } from "@/lib/db"
import { account, externalLink, passkey, user } from "@/lib/db/schema"
import { apiError, parseJson, verifyAdminRequest } from "@/lib/tretu/admin-api"
import { LINK_PROVIDERS, normalizeAccountId } from "@/lib/tretu/links"
import { emitUserEvent } from "@/lib/tretu/events"

export const dynamic = "force-dynamic"

const provider = z.enum(LINK_PROVIDERS)
const linkBody = z.object({
  sub: z.string().min(1).max(64),
  provider,
  providerAccountId: z.string().trim().min(1).max(64),
  displayName: z.string().trim().max(64).nullish(),
})
const unlinkBody = z.object({ sub: z.string().min(1).max(64), provider })

type LinkResult = "conflict" | "unchanged" | "changed"

/** Steam is a sign-in identity (an `account` row, provider `steam`), the same one "Mit Steam anmelden" uses. */
async function linkSteam(sub: string, steamId: string, displayName: string | null): Promise<LinkResult> {
  return db.transaction(async (tx) => {
    const taken = await tx.query.account.findFirst({ where: and(eq(account.providerId, "steam"), eq(account.accountId, steamId)) })
    if (taken && taken.userId !== sub) return "conflict"
    const current = await tx.query.account.findFirst({ where: and(eq(account.userId, sub), eq(account.providerId, "steam")) })
    if (current) {
      if (current.accountId === steamId && (displayName === null || current.displayName === displayName)) return "unchanged"
      await tx
        .update(account)
        .set({ accountId: steamId, ...(displayName !== null && { displayName }) })
        .where(eq(account.id, current.id))
    } else {
      const now = new Date()
      await tx.insert(account).values({ id: randomUUID(), userId: sub, providerId: "steam", accountId: steamId, displayName, createdAt: now, updatedAt: now })
    }
    return "changed"
  })
}

async function linkExternal(sub: string, kind: "minecraft" | "teamspeak", accountId: string, displayName: string | null): Promise<LinkResult> {
  return db.transaction(async (tx) => {
    const taken = await tx.query.externalLink.findFirst({ where: and(eq(externalLink.provider, kind), eq(externalLink.providerAccountId, accountId)) })
    if (taken && taken.userId !== sub) return "conflict"
    const current = await tx.query.externalLink.findFirst({ where: and(eq(externalLink.userId, sub), eq(externalLink.provider, kind)) })
    if (current) {
      if (current.providerAccountId === accountId && current.displayName === displayName) return "unchanged"
      await tx.update(externalLink).set({ providerAccountId: accountId, displayName }).where(eq(externalLink.id, current.id))
    } else {
      await tx.insert(externalLink).values({ userId: sub, provider: kind, providerAccountId: accountId, displayName })
    }
    return "changed"
  })
}

/** POST /api/v1/links — link a Minecraft, Steam or TeamSpeak account to a Tretu ID (contract §2). */
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

  const displayName = input.displayName ?? null
  const result = input.provider === "steam" ? await linkSteam(input.sub, accountId, displayName) : await linkExternal(input.sub, input.provider, accountId, displayName)
  if (result === "conflict") return apiError(409, "conflict", "This account is linked to another Tretu ID")
  if (result === "changed") {
    await audit("link.added", { userId: input.sub, meta: { provider: input.provider, by: verified.app } })
    await emitUserEvent("user.updated", input.sub)
  }
  return Response.json({ ok: true })
}

/** DELETE /api/v1/links — remove a Minecraft, Steam or TeamSpeak link. */
export async function DELETE(request: Request) {
  const verified = await verifyAdminRequest(request)
  if (verified instanceof Response) return verified
  const parsed = unlinkBody.safeParse(parseJson(verified.body))
  if (!parsed.success) return apiError(400, "invalid_request", z.prettifyError(parsed.error))
  const { sub, provider: kind } = parsed.data
  let removed = 0
  if (kind === "steam") {
    const row = await db.query.account.findFirst({ where: and(eq(account.userId, sub), eq(account.providerId, "steam")), columns: { id: true } })
    if (row) {
      // Steam may be the account's only way to sign in (signed up with Steam): then it stays.
      const [others] = await db.select({ n: sql<number>`count(*)::int` }).from(account).where(and(eq(account.userId, sub), ne(account.id, row.id)))
      const hasPasskey = await db.query.passkey.findFirst({ where: eq(passkey.userId, sub), columns: { id: true } })
      if (!others?.n && !hasPasskey) return apiError(409, "last_sign_in_method", "Steam is the only way this account signs in")
      removed = (await db.delete(account).where(eq(account.id, row.id)).returning({ id: account.id })).length
    }
  } else {
    removed = (
      await db
        .delete(externalLink)
        .where(and(eq(externalLink.userId, sub), eq(externalLink.provider, kind)))
        .returning({ id: externalLink.id })
    ).length
  }
  if (removed) {
    await audit("link.removed", { userId: sub, meta: { provider: kind, by: verified.app } })
    await emitUserEvent("user.updated", sub)
  }
  return Response.json({ ok: true })
}
