import { and, desc, eq, gt, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import type { Db } from "@/lib/db"
import * as s from "@/lib/db/schema"
import { isPlaceholderEmail, PLACEHOLDER_EMAIL_DOMAIN, type UserLinks } from "@/lib/oidc/claims"
import { normalizeAccountId } from "@/lib/tretu/links"
import { getUserLinksMany, isLockActive } from "@/lib/users"

/** One account in the admin user list (GET /api/v1/admin/users). */
export interface AdminUserItem {
  sub: string
  username: string | null
  name: string
  /** null for accounts without a real address (Steam sign-ups, imported accounts). */
  email: string | null
  picture: string | null
  createdAt: string
  lastSignInAt: string | null
  roles: string[]
  twoFactor: boolean
  locked: boolean
  links: UserLinks
}

interface ItemRow {
  id: string
  username: string | null
  displayUsername: string | null
  name: string
  email: string
  image: string | null
  createdAt: Date
  lastLoginAt: Date | null
  roles: string[]
  twoFactorEnabled: boolean | null
  locked: boolean
  lockedUntil: Date | null
}

function toItem(row: ItemRow, links: UserLinks, now: Date): AdminUserItem {
  return {
    sub: row.id,
    username: row.displayUsername || row.username,
    name: row.name,
    email: isPlaceholderEmail(row.email) ? null : row.email,
    picture: row.image,
    createdAt: row.createdAt.toISOString(),
    lastSignInAt: row.lastLoginAt?.toISOString() ?? null,
    roles: row.roles,
    twoFactor: Boolean(row.twoFactorEnabled),
    locked: isLockActive(row, now),
    links,
  }
}

/* ───────────────────────── Search ───────────────────────── */

export const SEARCH_LIMIT_MAX = 100

/** Position in the result order (exact match first, newest first): `[exact, createdAt with µs, id]`, base64url JSON. */
const cursorSchema = z.tuple([z.union([z.literal(0), z.literal(1)]), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/), z.string().min(1).max(64)])
type Cursor = z.infer<typeof cursorSchema>

export const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url")
export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** `%text%` for LIKE/ILIKE with the wildcards in the text escaped (backslash is Postgres' default escape). */
const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`

/**
 * Finds accounts by username, display name, email, sub, a provider's account id (Discord ID, SteamID64, …),
 * Minecraft UUID or name, TeamSpeak UID or nickname. Each source is searched on its own index (trigram indexes for
 * the substring matches, migration 0003) and the hits are joined; exact matches come first, then the newest.
 * Without `q`, all accounts, newest first. Cursor pagination over that order.
 */
export async function searchUsers(
  db: Db,
  input: { q?: string; limit?: number; cursor?: Cursor | null },
): Promise<{ items: AdminUserItem[]; nextCursor: string | null }> {
  const q = (input.q ?? "").trim()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), SEARCH_LIMIT_MAX)
  const lower = q.toLowerCase()
  const pattern = containsPattern(q)
  const lowerPattern = containsPattern(lower)
  // Minecraft UUIDs are stored lowercase with dashes; people paste them either way.
  const uuid = normalizeAccountId("minecraft", q) ?? q
  const after = input.cursor
    ? sql`and (m.exact, u.created_at, u.id) < (${input.cursor[0]}::int, ${input.cursor[1]}::timestamptz, ${input.cursor[2]}::text)`
    : sql``

  const matches = q
    ? sql`
      with hits as (
        select id as user_id, (id = ${q} or username = ${lower} or lower(email) = ${lower}) as exact
          from "user"
          where id = ${q} or username like ${lowerPattern} or name ilike ${pattern}
             or (email ilike ${pattern} and email not like ${`%@${PLACEHOLDER_EMAIL_DOMAIN}`})
        union all
        select user_id, true from account where account_id = ${q}
        union all
        select user_id, (provider_account_id in (${q}, ${uuid}) or lower(display_name) = ${lower})
          from external_link
          where (provider in ('minecraft', 'teamspeak') and provider_account_id in (${q}, ${uuid})) or display_name ilike ${pattern}
      )
      select user_id, bool_or(exact)::int as exact from hits group by user_id`
    : sql`select id as user_id, 0 as exact from "user"`

  const rows = await db.execute<{
    id: string
    username: string | null
    display_username: string | null
    name: string
    email: string
    image: string | null
    created_at: Date | string
    last_login_at: Date | string | null
    roles: string[]
    two_factor_enabled: boolean | null
    locked: boolean
    locked_until: Date | string | null
    exact: number
    position: string
  }>(sql`
    select u.id, u.username, u.display_username, u.name, u.email, u.image, u.created_at, u.last_login_at, u.roles,
           u.two_factor_enabled, u.locked, u.locked_until, m.exact,
           to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as position
    from (${matches}) m
    join "user" u on u.id = m.user_id
    where true ${after}
    order by m.exact desc, u.created_at desc, u.id desc
    limit ${limit + 1}`)

  const page = [...rows].slice(0, limit)
  const date = (v: Date | string) => (v instanceof Date ? v : new Date(v))
  const links = await getUserLinksMany(
    page.map((r) => r.id),
    db,
  )
  const now = new Date()
  const items = page.map((r) =>
    toItem(
      {
        id: r.id,
        username: r.username,
        displayUsername: r.display_username,
        name: r.name,
        email: r.email,
        image: r.image,
        createdAt: date(r.created_at),
        lastLoginAt: r.last_login_at ? date(r.last_login_at) : null,
        roles: r.roles,
        twoFactorEnabled: r.two_factor_enabled,
        locked: r.locked,
        lockedUntil: r.locked_until ? date(r.locked_until) : null,
      },
      links.get(r.id) ?? {},
      now,
    ),
  )
  const last = page.at(-1)
  const nextCursor = rows.length > limit && last ? encodeCursor([Number(last.exact) ? 1 : 0, last.position, last.id]) : null
  return { items, nextCursor }
}

/* ───────────────────────── Detail ───────────────────────── */

export interface AdminUserDetail extends AdminUserItem {
  emailVerified: boolean
  locale: "de" | "en"
  lockedReason: string | null
  lockedUntil: string | null
  lockedAt: string | null
  /** Sign-in methods: `password` (accountId null), discord, google, apple, steam. */
  providers: { provider: string; accountId: string | null; displayName: string | null; createdAt: string }[]
  passkeys: { id: string; name: string | null; createdAt: string | null; lastUsedAt: string | null }[]
  /** Active sessions on auth.tretu.de; `client` is the app that last got tokens through the session. */
  sessions: { id: string; createdAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; client: string | null }[]
  legacyLinks: { app: string; legacyUserId: string; legacyUsername: string | null; importedAt: string; method: string }[]
  /** The newest 50 entries of the activity log. */
  audit: { id: string; event: string; success: boolean; ipAddress: string | null; userAgent: string | null; meta: Record<string, unknown> | null; createdAt: string }[]
}

const iso = (d: Date | null) => d?.toISOString() ?? null

export async function getAdminUserDetail(db: Db, sub: string): Promise<AdminUserDetail | null> {
  const row = await db.query.user.findFirst({ where: eq(s.user.id, sub) })
  if (!row) return null
  const now = new Date()
  const [links, providers, passkeys, sessions, legacy, activity] = await Promise.all([
    getUserLinksMany([sub], db),
    db
      .select({ provider: s.account.providerId, accountId: s.account.accountId, displayName: s.account.displayName, createdAt: s.account.createdAt })
      .from(s.account)
      .where(eq(s.account.userId, sub))
      .orderBy(s.account.createdAt),
    db
      .select({ id: s.passkey.id, name: s.passkey.name, createdAt: s.passkey.createdAt, lastUsedAt: s.passkey.lastUsedAt })
      .from(s.passkey)
      .where(eq(s.passkey.userId, sub))
      .orderBy(s.passkey.createdAt),
    db
      .select({
        id: s.session.id,
        createdAt: s.session.createdAt,
        expiresAt: s.session.expiresAt,
        ipAddress: s.session.ipAddress,
        userAgent: s.session.userAgent,
      })
      .from(s.session)
      .where(and(eq(s.session.userId, sub), gt(s.session.expiresAt, now)))
      .orderBy(desc(s.session.createdAt)),
    db
      .select({ app: s.legacyLink.app, legacyUserId: s.legacyLink.legacyUserId, legacyUsername: s.legacyLink.legacyUsername, importedAt: s.legacyLink.importedAt, method: s.legacyLink.method })
      .from(s.legacyLink)
      .where(eq(s.legacyLink.userId, sub))
      .orderBy(s.legacyLink.app),
    db
      .select({
        id: s.auditLog.id,
        event: s.auditLog.event,
        success: s.auditLog.success,
        ipAddress: s.auditLog.ipAddress,
        userAgent: s.auditLog.userAgent,
        meta: s.auditLog.meta,
        createdAt: s.auditLog.createdAt,
      })
      .from(s.auditLog)
      .where(eq(s.auditLog.userId, sub))
      .orderBy(desc(s.auditLog.createdAt))
      .limit(50),
  ])

  // The app of each session: the newest token issued through it.
  const sessionIds = sessions.map((x) => x.id)
  const clients = new Map<string, string>()
  if (sessionIds.length) {
    const [refresh, access] = await Promise.all([
      db
        .select({ sessionId: s.oauthRefreshToken.sessionId, clientId: s.oauthRefreshToken.clientId, createdAt: s.oauthRefreshToken.createdAt })
        .from(s.oauthRefreshToken)
        .where(inArray(s.oauthRefreshToken.sessionId, sessionIds)),
      db
        .select({ sessionId: s.oauthAccessToken.sessionId, clientId: s.oauthAccessToken.clientId, createdAt: s.oauthAccessToken.createdAt })
        .from(s.oauthAccessToken)
        .where(inArray(s.oauthAccessToken.sessionId, sessionIds)),
    ])
    const tokens = [...refresh, ...access]
    tokens.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    for (const token of tokens) if (token.sessionId) clients.set(token.sessionId, token.clientId)
  }

  return {
    ...toItem(row, links.get(sub) ?? {}, now),
    emailVerified: row.emailVerified && !isPlaceholderEmail(row.email),
    locale: row.locale === "en" ? "en" : "de",
    lockedReason: row.locked ? row.lockedReason : null,
    lockedUntil: row.locked ? iso(row.lockedUntil) : null,
    lockedAt: row.locked ? iso(row.lockedAt) : null,
    providers: providers.map((p) => ({
      provider: p.provider === "credential" ? "password" : p.provider,
      accountId: p.provider === "credential" ? null : p.accountId,
      displayName: p.displayName,
      createdAt: p.createdAt.toISOString(),
    })),
    passkeys: passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: iso(p.createdAt), lastUsedAt: iso(p.lastUsedAt) })),
    sessions: sessions.map((x) => ({
      id: x.id,
      createdAt: x.createdAt.toISOString(),
      expiresAt: x.expiresAt.toISOString(),
      ipAddress: x.ipAddress,
      userAgent: x.userAgent,
      client: clients.get(x.id) ?? null,
    })),
    legacyLinks: legacy.map((l) => ({ ...l, importedAt: l.importedAt.toISOString() })),
    audit: activity.map((a) => ({ ...a, meta: a.meta ?? null, createdAt: a.createdAt.toISOString() })),
  }
}

/** The list item of one account (mutation responses). */
export async function getAdminUserItem(db: Db, sub: string): Promise<AdminUserItem | null> {
  const row = await db.query.user.findFirst({ where: eq(s.user.id, sub) })
  if (!row) return null
  return toItem(row, (await getUserLinksMany([sub], db)).get(sub) ?? {}, new Date())
}

/* ───────────────────────── Stats ───────────────────────── */

export const STATS_DAYS = 90
/** Calendar days of the stats, as everywhere in Tretu (daily top-up, game caps). */
export const STATS_TIME_ZONE = "Europe/Berlin"

export interface AdminStats {
  users: { total: number; verified: number; withTwoFactor: number; locked: number; admins: number }
  /** New accounts per day, the last 90 days (Europe/Berlin), oldest first, days without any included. */
  signUpsPerDay: { day: string; count: number }[]
  /** Accounts that signed in per day (each account once a day), same days. */
  signInsPerDay: { day: string; count: number }[]
  /** Accounts that can sign in with each method. */
  providers: { password: number; discord: number; google: number; apple: number; steam: number; passkey: number }
}

export async function getAdminStats(db: Db, now: Date = new Date()): Promise<AdminStats> {
  const tz = STATS_TIME_ZONE
  // Raw SQL parameters: dates as ISO strings (the driver serialises only typed parameters itself).
  const at = now.toISOString()
  // The first day of the series, at midnight Berlin time: lets the range scans use the created_at indexes.
  const series = sql`
    select d::date as day from generate_series(
      (${at}::timestamptz at time zone ${tz})::date - ${STATS_DAYS - 1}::int,
      (${at}::timestamptz at time zone ${tz})::date,
      interval '1 day') as d`
  const since = sql`(((${at}::timestamptz at time zone ${tz})::date - ${STATS_DAYS - 1}::int)::timestamp at time zone ${tz})`

  const [[users], signUps, signIns, accounts, [passkeys]] = await Promise.all([
    db.execute<{ total: number; verified: number; with_two_factor: number; locked: number; admins: number }>(sql`
      select count(*)::int as total,
             count(*) filter (where email_verified and email not like ${`%@${PLACEHOLDER_EMAIL_DOMAIN}`})::int as verified,
             count(*) filter (where two_factor_enabled)::int as with_two_factor,
             count(*) filter (where locked and (locked_until is null or locked_until > ${at}::timestamptz))::int as locked,
             count(*) filter (where 'admin' = any(roles))::int as admins
      from "user"`),
    db.execute<{ day: string; count: number }>(sql`
      with days as (${series}),
      counted as (
        select (created_at at time zone ${tz})::date as day, count(*)::int as count
        from "user" where created_at >= ${since} group by 1
      )
      select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(counted.count, 0)::int as count
      from days left join counted on counted.day = days.day order by days.day`),
    db.execute<{ day: string; count: number }>(sql`
      with days as (${series}),
      counted as (
        select (created_at at time zone ${tz})::date as day, count(distinct user_id)::int as count
        from audit_log where event = 'login' and success and user_id is not null and created_at >= ${since} group by 1
      )
      select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(counted.count, 0)::int as count
      from days left join counted on counted.day = days.day order by days.day`),
    db.execute<{ provider_id: string; count: number }>(sql`select provider_id, count(distinct user_id)::int as count from account group by provider_id`),
    db.execute<{ count: number }>(sql`select count(distinct user_id)::int as count from passkey`),
  ])
  const byProvider = new Map([...accounts].map((r) => [r.provider_id, Number(r.count)]))
  return {
    users: {
      total: Number(users?.total ?? 0),
      verified: Number(users?.verified ?? 0),
      withTwoFactor: Number(users?.with_two_factor ?? 0),
      locked: Number(users?.locked ?? 0),
      admins: Number(users?.admins ?? 0),
    },
    signUpsPerDay: [...signUps].map((r) => ({ day: r.day, count: Number(r.count) })),
    signInsPerDay: [...signIns].map((r) => ({ day: r.day, count: Number(r.count) })),
    providers: {
      password: byProvider.get("credential") ?? 0,
      discord: byProvider.get("discord") ?? 0,
      google: byProvider.get("google") ?? 0,
      apple: byProvider.get("apple") ?? 0,
      steam: byProvider.get("steam") ?? 0,
      passkey: Number(passkeys?.count ?? 0),
    },
  }
}
