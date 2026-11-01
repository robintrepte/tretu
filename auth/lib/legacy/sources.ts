import postgres from "postgres"
import { fromBcrypt, fromNative } from "@/lib/passwords"
import type { IdentityProvider, LegacyRecord } from "./plan"

/**
 * Read-only readers for the old apps' databases. Each opens its own connection with
 * `default_transaction_read_only`, so the import can never write to a legacy database.
 */

type Sql = ReturnType<typeof postgres>

function connect(url: string): Sql {
  return postgres(url, { max: 2, onnotice: () => {}, connect_timeout: 15, connection: { default_transaction_read_only: true, application_name: "tretu-auth-legacy-import" } })
}

async function withSql<T>(url: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = connect(url)
  try {
    return await fn(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/** Timestamps arrive as Date, ISO strings or (old SQLite exports) unix seconds/milliseconds. */
export function toDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const n = Number(value)
    return new Date(n < 1e12 ? n * 1000 : n)
  }
  if (typeof value === "string") {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date(0)
}

const lower = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null)
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const SOCIAL = new Set<IdentityProvider>(["discord", "google", "apple"])

/** Saga (Prisma): "User" and "Account". bcrypt passwords. */
export async function readSaga(url: string): Promise<LegacyRecord[]> {
  return withSql(url, async (sql) => {
    const users = await sql`select id, username, name, email, "emailVerified", image, password, role, "createdAt" from "User"`
    const accounts = await sql`select "userId", provider, "providerAccountId" from "Account"`
    const byUser = new Map<string, { provider: IdentityProvider; id: string }[]>()
    for (const a of accounts) {
      if (!SOCIAL.has(a.provider)) continue
      const list = byUser.get(String(a.userId)) ?? []
      list.push({ provider: a.provider, id: String(a.providerAccountId) })
      byUser.set(String(a.userId), list)
    }
    return users.map((u): LegacyRecord => {
      const identities = byUser.get(String(u.id)) ?? []
      return {
        app: "saga",
        legacyUserId: String(u.id),
        username: text(u.username),
        name: text(u.name) ?? text(u.username),
        email: lower(u.email),
        // Saga never verified emails itself; accounts created through Discord/Google required a verified one.
        emailVerified: u.emailVerified != null || (!u.password && identities.length > 0),
        image: text(u.image),
        createdAt: toDate(u.createdAt),
        passwordHash: fromBcrypt(u.password),
        identities,
        steamId: null,
        roles: u.role ? [String(u.role)] : [],
      }
    })
  })
}

/** Play (Better Auth + Drizzle): "user" and "account". Native Better Auth password hashes. Guests are skipped. */
export async function readPlay(url: string): Promise<{ records: LegacyRecord[]; skipped: number }> {
  return withSql(url, async (sql) => {
    const users = await sql`select id, name, email, email_verified, image, username, role, is_anonymous, created_at from "user"`
    const accounts = await sql`select user_id, provider_id, account_id, password from account`
    const byUser = new Map<string, { identities: { provider: IdentityProvider; id: string }[]; password: string | null }>()
    for (const a of accounts) {
      const entry = byUser.get(String(a.user_id)) ?? { identities: [], password: null }
      if (a.provider_id === "credential") entry.password = fromNative(a.password)
      else if (SOCIAL.has(a.provider_id)) entry.identities.push({ provider: a.provider_id, id: String(a.account_id) })
      byUser.set(String(a.user_id), entry)
    }
    const records: LegacyRecord[] = []
    let skipped = 0
    for (const u of users) {
      if (u.is_anonymous) {
        skipped++
        continue
      }
      const entry = byUser.get(String(u.id)) ?? { identities: [], password: null }
      records.push({
        app: "play",
        legacyUserId: String(u.id),
        username: text(u.username),
        name: text(u.name),
        email: lower(u.email),
        emailVerified: Boolean(u.email_verified),
        image: text(u.image),
        createdAt: toDate(u.created_at),
        passwordHash: entry.password,
        identities: entry.identities,
        steamId: null,
        roles: u.role ? [String(u.role)] : [],
      })
    }
    return { records, skipped }
  })
}

/** tretu.de: Discord-only accounts in "users" (+ roles from user_roles). */
export async function readTretu(url: string): Promise<LegacyRecord[]> {
  return withSql(url, async (sql) => {
    const users = await sql`select id, discord_id, display_name, avatar_url, created_at from users`
    const roleRows = await sql`select ur.user_id, r.key from user_roles ur join roles r on r.id = ur.role_id`.catch(() => [])
    const roles = new Map<string, string[]>()
    for (const r of roleRows) roles.set(String(r.user_id), [...(roles.get(String(r.user_id)) ?? []), String(r.key)])
    return users
      .filter((u) => text(u.discord_id))
      .map(
        (u): LegacyRecord => ({
          app: "tretu-web",
          legacyUserId: String(u.id),
          username: null,
          name: text(u.display_name),
          email: null,
          emailVerified: false,
          image: text(u.avatar_url),
          createdAt: toDate(u.created_at),
          passwordHash: null,
          identities: [{ provider: "discord", id: String(u.discord_id) }],
          steamId: null,
          roles: roles.get(String(u.id)) ?? [],
        }),
      )
  })
}

const NAKAMA_SYSTEM_USER = "00000000-0000-0000-0000-000000000000"

/** Hollowmere (Nakama): "users". bcrypt passwords (bytea); Discord via custom_id "discord:<id>". Emails are unverified. */
export async function readNakama(url: string): Promise<{ records: LegacyRecord[]; skipped: number }> {
  return withSql(url, async (sql) => {
    const users = await sql`select id, username, display_name, avatar_url, email, password, custom_id, google_id, apple_id, steam_id, create_time from users`
    const records: LegacyRecord[] = []
    let skipped = 0
    for (const u of users) {
      if (String(u.id) === NAKAMA_SYSTEM_USER) {
        skipped++
        continue
      }
      const identities: { provider: IdentityProvider; id: string }[] = []
      const custom = text(u.custom_id)
      if (custom?.startsWith("discord:")) identities.push({ provider: "discord", id: custom.slice("discord:".length) })
      if (text(u.google_id)) identities.push({ provider: "google", id: text(u.google_id)! })
      if (text(u.apple_id)) identities.push({ provider: "apple", id: text(u.apple_id)! })
      records.push({
        app: "hollowmere",
        legacyUserId: String(u.id),
        username: text(u.username),
        name: text(u.display_name) ?? text(u.username),
        email: lower(u.email),
        emailVerified: false,
        image: text(u.avatar_url),
        createdAt: toDate(u.create_time),
        passwordHash: fromBcrypt(u.password as Uint8Array | string | null),
        identities,
        steamId: text(u.steam_id),
        roles: [],
      })
    }
    return { records, skipped }
  })
}
