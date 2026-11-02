"use server"

import { and, eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { z } from "zod"
import { audit, requestIp } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { env, isHttps, issuer, socialProviders, steamEnabled } from "@/lib/env"
import { CLAIM_COOKIE, RENAME_INTERVAL_DAYS, signClaim } from "@/lib/account"
import { claimWithPassword, CLAIMABLE_APPS } from "@/lib/legacy/claim"
import { composeMail, sendMail } from "@/lib/mail"
import { isPlaceholderEmail, normalizeLocale } from "@/lib/oidc/claims"
import { verifyStoredPassword } from "@/lib/passwords"
import { rateLimit } from "@/lib/rate-limit"
import { getSession } from "@/lib/session"
import { emitUserDeleted, emitUserEvent } from "@/lib/tretu/events"
import { isValidUsername, normalizeUsername } from "@/lib/usernames"

async function currentUser() {
  const session = await getSession()
  if (!session) throw new Error("not signed in")
  const row = await db.query.user.findFirst({ where: eq(s.user.id, session.user.id) })
  if (!row) throw new Error("not signed in")
  return { session, user: row }
}

async function requestMeta() {
  const h = await headers()
  return { ipAddress: requestIp(h), userAgent: h.get("user-agent") }
}

type UsernameResult = { ok: true } | { ok: false; error: "invalid" | "taken" | "tooSoon"; until?: string }

async function applyUsername(userId: string, wanted: string, free: boolean): Promise<UsernameResult> {
  const name = wanted.trim()
  if (!isValidUsername(name)) return { ok: false, error: "invalid" }
  const lower = normalizeUsername(name)
  const row = await db.query.user.findFirst({ where: eq(s.user.id, userId) })
  if (!row) return { ok: false, error: "invalid" }
  if (!free && !row.usernamePending && row.usernameChangedAt) {
    const until = new Date(row.usernameChangedAt.getTime() + RENAME_INTERVAL_DAYS * 86_400_000)
    if (until > new Date() && lower !== row.username) return { ok: false, error: "tooSoon", until: until.toISOString() }
  }
  const taken = await db.query.user.findFirst({ where: eq(s.user.username, lower), columns: { id: true } })
  if (taken && taken.id !== userId) return { ok: false, error: "taken" }
  const changed = lower !== row.username || name !== row.displayUsername
  try {
    await db
      .update(s.user)
      .set({
        username: lower,
        displayUsername: name,
        usernamePending: false,
        // Only a real rename starts the 30-day wait; fixing the case or confirming the suggestion does not.
        ...(lower !== row.username && !row.usernamePending ? { usernameChangedAt: new Date() } : {}),
      })
      .where(eq(s.user.id, userId))
  } catch {
    return { ok: false, error: "taken" }
  }
  if (changed) {
    await audit("username.changed", { userId, ...(await requestMeta()), meta: { from: row.displayUsername, to: name } })
    await emitUserEvent("user.updated", userId)
  }
  return { ok: true }
}

/** The free rename after a legacy name conflict (also on /weiter). */
export async function confirmUsername(wanted: string): Promise<UsernameResult> {
  const { user } = await currentUser()
  return applyUsername(user.id, wanted, user.usernamePending)
}

export async function changeUsername(wanted: string): Promise<UsernameResult> {
  const { user } = await currentUser()
  return applyUsername(user.id, wanted, false)
}

export async function updateLocale(locale: string) {
  const { user } = await currentUser()
  const value = normalizeLocale(locale)
  await db.update(s.user).set({ locale: value }).where(eq(s.user.id, user.id))
  ;(await cookies()).set("NEXT_LOCALE", value, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", secure: isHttps })
  if (value !== user.locale) {
    await audit("locale.changed", { userId: user.id, ...(await requestMeta()), meta: { locale: value } })
    await emitUserEvent("user.updated", user.id)
  }
  return { ok: true as const }
}

const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export async function uploadAvatar(formData: FormData): Promise<{ ok: boolean; image?: string }> {
  const { user } = await currentUser()
  if (!rateLimit(`avatar:${user.id}`, 10, 60 * 60_000)) return { ok: false }
  const file = formData.get("file")
  if (!(file instanceof File) || !AVATAR_TYPES.has(file.type) || file.size > AVATAR_MAX_BYTES || file.size === 0) return { ok: false }
  let data: Buffer
  try {
    const sharp = (await import("sharp")).default
    // Re-encoding strips metadata (EXIF, GPS) and anything that is not a picture.
    data = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    return { ok: false }
  }
  await db
    .insert(s.avatar)
    .values({ userId: user.id, contentType: "image/webp", data })
    .onConflictDoUpdate({ target: s.avatar.userId, set: { data, contentType: "image/webp", updatedAt: new Date() } })
  const image = `${issuer}/api/avatar/${user.id}?v=${Date.now().toString(36)}`
  await db.update(s.user).set({ image }).where(eq(s.user.id, user.id))
  await audit("profile.updated", { userId: user.id, ...(await requestMeta()), meta: { field: "avatar" } })
  await emitUserEvent("user.updated", user.id)
  return { ok: true, image }
}

export async function removeAvatar() {
  const { user } = await currentUser()
  await db.delete(s.avatar).where(eq(s.avatar.userId, user.id))
  await db.update(s.user).set({ image: null }).where(eq(s.user.id, user.id))
  await audit("profile.updated", { userId: user.id, ...(await requestMeta()), meta: { field: "avatar" } })
  await emitUserEvent("user.updated", user.id)
  return { ok: true as const }
}

const firstPasswordEmail = z.email().max(254)

/**
 * Sets a first password for accounts that only used Discord, Google, Apple, Steam or passkeys. Password sign-in
 * needs a confirmed email address (requireEmailVerification), so accounts without a real one (Steam sign-ups,
 * imported accounts: placeholder addresses) give one here and confirm it through the link we send; until then the
 * password exists but cannot be used, exactly like after a normal registration.
 */
export async function setFirstPassword(newPassword: string, email?: string): Promise<{ ok: boolean; emailSent?: boolean; error?: "short" | "compromised" | "exists" | "email" }> {
  const { user } = await currentUser()
  if (newPassword.length < 10 || newPassword.length > 128) return { ok: false, error: "short" }
  const needsEmail = isPlaceholderEmail(user.email)
  const parsedEmail = needsEmail ? firstPasswordEmail.safeParse(email?.trim().toLowerCase()) : null
  if (parsedEmail && !parsedEmail.success) return { ok: false, error: "email" }
  const requestHeaders = await headers()
  try {
    await auth.api.setPassword({ body: { newPassword }, headers: requestHeaders })
  } catch (error) {
    const code = (error as { body?: { code?: string } }).body?.code
    return { ok: false, error: code === "PASSWORD_COMPROMISED" ? "compromised" : "exists" }
  }
  if (!parsedEmail?.success) return { ok: true }
  try {
    // An unconfirmed (placeholder) address changes only once the link sent to the new address is opened.
    await auth.api.changeEmail({ body: { newEmail: parsedEmail.data, callbackURL: "/konto?tab=sicherheit" }, headers: requestHeaders })
  } catch {
    return { ok: false, error: "email" }
  }
  return { ok: true, emailSent: true }
}

/** Signs out every session and revokes every app token (apps' refresh tokens stop working). */
export async function signOutEverywhere() {
  const { user } = await currentUser()
  await db.transaction(async (tx) => {
    await tx.delete(s.oauthAccessToken).where(eq(s.oauthAccessToken.userId, user.id))
    await tx.delete(s.oauthRefreshToken).where(eq(s.oauthRefreshToken.userId, user.id))
    await tx.delete(s.session).where(eq(s.session.userId, user.id))
  })
  await audit("sessions.revoked", { userId: user.id, ...(await requestMeta()), meta: { scope: "everywhere" } })
  return { ok: true as const }
}

/** Minecraft and TeamSpeak links (made by the Minecraft server and tretu.de); Steam is unlinked like a provider. */
export async function unlinkGameAccount(provider: "minecraft" | "teamspeak") {
  const { user } = await currentUser()
  if (provider !== "minecraft" && provider !== "teamspeak") return { ok: false as const }
  const removed = await db
    .delete(s.externalLink)
    .where(and(eq(s.externalLink.userId, user.id), eq(s.externalLink.provider, provider)))
    .returning({ id: s.externalLink.id })
  if (removed.length) {
    await audit("link.removed", { userId: user.id, ...(await requestMeta()), meta: { provider } })
    await emitUserEvent("user.updated", user.id)
  }
  return { ok: true as const }
}

const deleteInput = z.object({ confirm: z.string(), password: z.string().optional() })

/**
 * Deletes the account: everything cascades (sessions, tokens, passkeys, links, audit log), every app is told
 * through user.deleted. Needs the username typed in and, if the account has one, the password; otherwise
 * the session must be fresh (signed in within the last 15 minutes).
 */
export async function deleteAccount(input: { confirm: string; password?: string }): Promise<{ ok: boolean; error?: "mismatch" | "password" | "reauth" }> {
  const parsed = deleteInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "mismatch" }
  const { session, user } = await currentUser()
  if (normalizeUsername(parsed.data.confirm) !== (user.username ?? "")) return { ok: false, error: "mismatch" }
  if (!rateLimit(`delete:${user.id}`, 5, 15 * 60_000)) return { ok: false, error: "password" }
  const credential = await db.query.account.findFirst({
    where: and(eq(s.account.userId, user.id), eq(s.account.providerId, "credential")),
    columns: { password: true },
  })
  if (credential?.password) {
    if (!(await verifyStoredPassword(credential.password, parsed.data.password ?? ""))) return { ok: false, error: "password" }
  } else if (Date.now() - new Date(session.session.createdAt).getTime() > 15 * 60_000) {
    return { ok: false, error: "reauth" }
  }
  await db.delete(s.user).where(eq(s.user.id, user.id))
  await emitUserDeleted(user.id)
  await sendMail(composeMail("accountDeleted", normalizeLocale(user.locale), user.email, { name: user.name })).catch(() => {})
  const store = await cookies()
  for (const cookie of store.getAll()) if (cookie.name.includes("tretu.")) store.delete(cookie.name)
  return { ok: true }
}

const claimInput = z.object({ app: z.enum(CLAIMABLE_APPS), identifier: z.string().max(200), password: z.string().max(200) })

export async function claimLegacyAccount(input: { app: string; identifier: string; password: string }) {
  const parsed = claimInput.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "notFound" as const }
  const { user } = await currentUser()
  if (!rateLimit(`claim:${user.id}`, 8, 15 * 60_000)) return { ok: false as const, error: "rateLimited" as const }
  const result = await claimWithPassword(db, { userId: user.id, ...parsed.data, claimDays: env.LEGACY_CLAIM_DAYS })
  const meta = { app: parsed.data.app, ...(result.ok ? { legacy: result.legacyName } : { reason: result.error }) }
  await audit(result.ok ? "legacy.claimed" : "legacy.claim_failed", { userId: user.id, success: result.ok, ...(await requestMeta()), meta })
  return result
}

/** Starts the "prove with Discord/Google" claim: remembers who wants the account, for 10 minutes. */
export async function startOAuthClaim(provider: string) {
  const { user } = await currentUser()
  const enabled = provider === "steam" ? steamEnabled : provider in socialProviders && socialProviders[provider as keyof typeof socialProviders]
  if (!enabled) return { ok: false as const }
  const payload = `${user.id}.${Date.now() + 10 * 60_000}`
  ;(await cookies()).set(CLAIM_COOKIE, `${payload}.${signClaim(payload)}`, { httpOnly: true, secure: isHttps, sameSite: "lax", path: "/", maxAge: 600 })
  return { ok: true as const }
}
