import { randomUUID } from "node:crypto"
import { eq, inArray, sql } from "drizzle-orm"
import { db as defaultDb, type Db } from "@/lib/db"
import { eventOutbox } from "@/lib/db/schema"
import { env, platformEnabled } from "@/lib/env"
import { signRequest } from "@/lib/tretu/signing"
import { getUserShape } from "@/lib/users"

/**
 * User events to the platform (contract §4) through an outbox table: every change is recorded in the same
 * database as the change, and delivered (signed as app "auth") by `npm run worker:events` with retries.
 * The web process also tries to deliver right away, so events usually arrive within a second.
 * Without TRETU_PLATFORM_URL + TRETU_APP_SECRET nothing is sent; the outbox keeps the events for later.
 */

export const APP_ID = "auth"
export type UserEventType = "user.created" | "user.updated" | "user.deleted"

export interface EventEnvelope {
  id: string
  type: string
  app: string
  sub: string | null
  occurredAt: string
  data: Record<string, unknown>
}

export function buildEnvelope(type: UserEventType, sub: string, data: Record<string, unknown>, now = new Date()): EventEnvelope {
  return { id: randomUUID(), type, app: APP_ID, sub, occurredAt: now.toISOString(), data }
}

export async function enqueueEvent(envelope: EventEnvelope, db: Db = defaultDb): Promise<void> {
  await db.insert(eventOutbox).values({ id: envelope.id, type: envelope.type, sub: envelope.sub, envelope: { ...envelope } })
  // Inside the web server, deliver right away; scripts leave it to the worker.
  if (platformEnabled && db === defaultDb && process.env.NEXT_RUNTIME) kickDelivery()
}

/** user.created / user.updated with the current user shape. */
export async function emitUserEvent(type: "user.created" | "user.updated", userId: string, db: Db = defaultDb): Promise<void> {
  try {
    const shape = await getUserShape(userId, db)
    if (!shape) return
    await enqueueEvent(buildEnvelope(type, userId, { ...shape }), db)
  } catch (error) {
    console.error(`[events] could not record ${type}`, error instanceof Error ? error.message : error)
  }
}

/** user.deleted: data is `{}`, or `{ mergedInto }` when the account was merged into another Tretu ID. */
export async function emitUserDeleted(sub: string, mergedInto?: string, db: Db = defaultDb): Promise<void> {
  try {
    await enqueueEvent(buildEnvelope("user.deleted", sub, mergedInto ? { mergedInto } : {}), db)
  } catch (error) {
    console.error("[events] could not record user.deleted", error instanceof Error ? error.message : error)
  }
}

let kickRunning = false
let kickAgain = false
function kickDelivery() {
  if (kickRunning) {
    kickAgain = true
    return
  }
  kickRunning = true
  void (async () => {
    try {
      do {
        kickAgain = false
        await deliverPending(defaultDb, { limit: 20 })
      } while (kickAgain)
    } catch (error) {
      console.error("[events] delivery failed", error instanceof Error ? error.message : error)
    } finally {
      kickRunning = false
    }
  })()
}

/** Retry delay after `attempts` failures: 15 s, 30 s, 1 min … capped at 1 h. */
export function backoffSeconds(attempts: number): number {
  return Math.min(15 * 2 ** Math.max(0, attempts - 1), 3600)
}

/** Events older than this are given up (still kept in the table with their last error). */
export const GIVE_UP_AFTER_HOURS = 72

export interface DeliveryResult {
  delivered: number
  failed: number
}

/**
 * Claims up to `limit` due events (row lease, safe with several processes), posts them as one batch and marks
 * them delivered. Duplicates are harmless: the platform ignores ids it has seen.
 */
export async function deliverPending(
  db: Db,
  options: { limit?: number; platformUrl?: string; secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<DeliveryResult> {
  const platformUrl = options.platformUrl ?? env.TRETU_PLATFORM_URL
  const secret = options.secret ?? env.TRETU_APP_SECRET
  if (!platformUrl || !secret) return { delivered: 0, failed: 0 }
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 100)

  const claimed = await db.execute<{ id: string; envelope: EventEnvelope; attempts: number }>(sql`
    update event_outbox set locked_until = now() + interval '60 seconds'
    where id in (
      select id from event_outbox
      where delivered_at is null and next_attempt_at <= now()
        and (locked_until is null or locked_until < now())
        and created_at > now() - make_interval(hours => ${GIVE_UP_AFTER_HOURS})
      order by created_at
      limit ${limit}
      for update skip locked
    )
    returning id, envelope, attempts`)
  const rows = [...claimed]
  if (!rows.length) return { delivered: 0, failed: 0 }
  rows.sort((a, b) => String(a.envelope.occurredAt).localeCompare(String(b.envelope.occurredAt)))

  const url = new URL("/api/v1/events", platformUrl)
  const body = JSON.stringify(rows.length === 1 ? rows[0]!.envelope : { events: rows.map((r) => r.envelope) })
  const headers = signRequest({ appId: APP_ID, secret, method: "POST", pathWithQuery: url.pathname + url.search, body })
  const ids = rows.map((r) => r.id)
  let error: string | null = null
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) error = `HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }

  if (!error) {
    await db
      .update(eventOutbox)
      .set({ deliveredAt: new Date(), lockedUntil: null, lastError: null, attempts: sql`${eventOutbox.attempts} + 1` })
      .where(inArray(eventOutbox.id, ids))
    return { delivered: rows.length, failed: 0 }
  }
  for (const row of rows) {
    const delay = backoffSeconds(row.attempts + 1)
    await db
      .update(eventOutbox)
      .set({ attempts: row.attempts + 1, lockedUntil: null, lastError: error, nextAttemptAt: new Date(Date.now() + delay * 1000) })
      .where(eq(eventOutbox.id, row.id))
  }
  console.warn(`[events] delivery of ${rows.length} event(s) failed: ${error}`)
  return { delivered: 0, failed: rows.length }
}
