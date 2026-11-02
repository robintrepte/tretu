/**
 * User directory: a local mirror of auth.tretu.de users, fed by `user.*` events from app `auth` and,
 * for subs we have never seen, by the auth admin API (`GET ${TRETU_AUTH_ISSUER}/api/v1/users/{sub}`,
 * signed as `tretu-web`).
 */
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { platformDeletedUsers, platformUsers, type PlatformUserLinks } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { type Executor } from "@/lib/platform/db";
import { getAppConfig, getAuthIssuer, SELF_APP_ID } from "@/lib/platform/env";
import { enqueueJob } from "@/lib/platform/jobs";
import { notFound } from "@/lib/platform/errors";
import { signedHeaders } from "@/lib/platform/signing";

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === null || v === undefined || v === "" ? undefined : v));

export const authUserSchema = z.object({
  sub: z.string().min(1).max(128),
  username: optionalString(64),
  name: optionalString(200),
  picture: optionalString(2000),
  locale: optionalString(10),
  roles: z.array(z.string().max(64)).max(50).nullish(),
  links: z
    .object({
      discord: optionalString(64),
      minecraft: optionalString(64),
      minecraftName: optionalString(64),
      steam: optionalString(64),
      teamspeak: optionalString(128),
    })
    .nullish(),
  createdAt: optionalString(64),
  /** Account lock (central admin spec): sign-in refused, sessions ended while true. */
  locked: z.boolean().nullish(),
  lockedUntil: optionalString(64),
});
export type AuthUser = z.infer<typeof authUserSchema>;
export type DirectoryUser = typeof platformUsers.$inferSelect;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{2,32}$/;

/** SteamID64 range of individual accounts (universe 1, type 1, instance 1): 76561197960265728 + account id. */
const STEAM_INDIVIDUAL_BASE = BigInt("76561197960265728");
const STEAM_ACCOUNT_ID_MAX = BigInt(0xffffffff);

/** The Steam ID if it is a valid individual SteamID64 (decimal), else null (never render anything else as a link). */
export function validSteamId(value: string | null | undefined): string | null {
  if (!value || !/^\d{17}$/.test(value)) return null;
  const accountId = BigInt(value) - STEAM_INDIVIDUAL_BASE;
  return accountId > BigInt(0) && accountId <= STEAM_ACCOUNT_ID_MAX ? value : null;
}

export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

function cleanLinks(links: AuthUser["links"]): PlatformUserLinks {
  const out: PlatformUserLinks = {};
  if (!links) return out;
  for (const key of ["discord", "minecraft", "minecraftName", "steam", "teamspeak"] as const) {
    if (links[key]) out[key] = links[key];
  }
  return out;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function isErased(db: Executor, sub: string): Promise<boolean> {
  const rows = await db
    .select({ sub: platformDeletedUsers.sub })
    .from(platformDeletedUsers)
    .where(eq(platformDeletedUsers.sub, sub))
    .limit(1);
  return rows.length > 0;
}

export async function getDirectoryUser(db: Executor, sub: string): Promise<DirectoryUser | null> {
  const rows = await db.select().from(platformUsers).where(eq(platformUsers.sub, sub)).limit(1);
  return rows[0] ?? null;
}

export type UpsertResult = { applied: boolean; previous: DirectoryUser | null; current: DirectoryUser | null };

/**
 * Applies an auth user record. Ignores records older than the last applied one (`sourceAt`).
 * Usernames are unique: a stale holder of the same username loses it (auth is the source of truth).
 */
export async function upsertDirectoryUser(db: Executor, user: AuthUser, sourceAt: Date): Promise<UpsertResult> {
  const previous = await getDirectoryUser(db, user.sub);
  if (previous?.sourceUpdatedAt && previous.sourceUpdatedAt.getTime() > sourceAt.getTime()) {
    return { applied: false, previous, current: previous };
  }
  const usernameLower = user.username?.toLowerCase() ?? null;
  if (usernameLower) {
    await db
      .update(platformUsers)
      .set({ username: null, usernameLower: null, updatedAt: new Date() })
      .where(and(eq(platformUsers.usernameLower, usernameLower), ne(platformUsers.sub, user.sub)));
  }
  const links = cleanLinks(user.links);
  const values = {
    username: user.username ?? null,
    usernameLower,
    name: user.name ?? null,
    picture: user.picture ?? null,
    locale: user.locale === "en" ? "en" : user.locale === "de" ? "de" : (user.locale ?? null),
    roles: user.roles ?? [],
    links,
    discordId: links.discord ?? null,
    steamId: validSteamId(links.steam),
    authCreatedAt: parseDate(user.createdAt) ?? previous?.authCreatedAt ?? null,
    sourceUpdatedAt: sourceAt,
    fetchedAt: new Date(),
    updatedAt: new Date(),
  };
  const [current] = await db
    .insert(platformUsers)
    .values({ sub: user.sub, ...values })
    .onConflictDoUpdate({ target: platformUsers.sub, set: values })
    .returning();
  return { applied: true, previous, current: current ?? null };
}

/** Creates a placeholder row (no profile yet) so stats etc. have a home; the worker fills it later. */
export async function ensureStub(db: Executor, sub: string): Promise<boolean> {
  const inserted = await db
    .insert(platformUsers)
    .values({ sub })
    .onConflictDoNothing()
    .returning({ sub: platformUsers.sub });
  if (inserted.length && getAuthIssuer()) {
    await enqueueJob(db, { type: "user.fetch", payload: { sub }, dedupeKey: `user.fetch:${sub}`, sub });
  }
  return inserted.length > 0;
}

function selfSecret(): string | null {
  return process.env.TRETU_APP_SECRET?.trim() || getAppConfig(SELF_APP_ID)?.secret || null;
}

export class AuthUnavailableError extends Error {}

/**
 * Signed request to the auth admin API (as `tretu-web`, 5 s timeout). Returns the raw response;
 * throws AuthUnavailableError when not configured.
 */
export async function authRequest(
  method: "GET" | "POST" | "DELETE",
  pathWithQuery: string,
  body?: unknown,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch
): Promise<Response> {
  const issuer = getAuthIssuer();
  const secret = selfSecret();
  if (!issuer || !secret) throw new AuthUnavailableError("auth admin API not configured");
  const url = new URL(issuer + pathWithQuery);
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers = signedHeaders(SELF_APP_ID, secret, { method, pathWithQuery: url.pathname + url.search, body: raw });
  return fetchImpl(url.toString(), {
    method,
    headers: raw ? { ...headers, "content-type": "application/json" } : headers,
    body: raw || undefined,
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
}

/** True when tretu.de can call auth's admin API (issuer + own secret). */
export function authAdminConfigured(): boolean {
  return Boolean(getAuthIssuer() && selfSecret());
}

async function authGet(pathWithQuery: string): Promise<unknown | null> {
  const issuer = getAuthIssuer();
  const secret = selfSecret();
  if (!issuer || !secret) throw new AuthUnavailableError("auth admin API not configured");
  const url = new URL(issuer + pathWithQuery);
  const headers = signedHeaders(SELF_APP_ID, secret, {
    method: "GET",
    pathWithQuery: url.pathname + url.search,
    body: "",
  });
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new AuthUnavailableError(`auth admin API answered ${res.status}`);
  return res.json();
}

export async function fetchAuthUser(sub: string): Promise<AuthUser | null> {
  const data = await authGet(`/api/v1/users/${encodeURIComponent(sub)}`);
  if (data === null) return null;
  const parsed = authUserSchema.safeParse(data);
  if (!parsed.success) throw new AuthUnavailableError("auth admin API returned an invalid user");
  return parsed.data;
}

export async function fetchAuthUserByUsername(username: string): Promise<AuthUser | null> {
  const data = await authGet(`/api/v1/users?username=${encodeURIComponent(username)}`);
  if (data === null) return null;
  const parsed = authUserSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * Returns the directory row for `sub`, fetching unknown users from auth (inline, 5 s timeout).
 * Null for erased subs and subs auth does not know. When auth is not configured or unreachable a
 * stub row is created so the request can proceed (unless `createStub: false`).
 */
export async function ensureUser(
  db: Executor,
  sub: string,
  options: { createStub?: boolean } = {}
): Promise<DirectoryUser | null> {
  const existing = await getDirectoryUser(db, sub);
  if (existing) return existing;
  if (await isErased(db, sub)) return null;
  if (getAuthIssuer() && selfSecret()) {
    try {
      const user = await fetchAuthUser(sub);
      if (!user || user.sub !== sub) return null;
      const { current } = await upsertDirectoryUser(db, user, new Date(0));
      return current;
    } catch (error) {
      log("warn", "platform.directory.fetch_failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (options.createStub === false) return null;
  await ensureStub(db, sub);
  return getDirectoryUser(db, sub);
}

/** Resolves a username (case-insensitive) to a directory user, asking auth if unknown locally. */
export async function findUserByUsername(db: Executor, username: string): Promise<DirectoryUser | null> {
  const lower = username.trim().toLowerCase();
  if (!lower) return null;
  const rows = await db.select().from(platformUsers).where(eq(platformUsers.usernameLower, lower)).limit(1);
  if (rows[0]) return rows[0];
  if (!getAuthIssuer() || !selfSecret() || !USERNAME_PATTERN.test(username.trim())) return null;
  try {
    const user = await fetchAuthUserByUsername(username.trim());
    if (!user || (await isErased(db, user.sub))) return null;
    const { current } = await upsertDirectoryUser(db, user, new Date(0));
    return current;
  } catch (error) {
    log("warn", "platform.directory.lookup_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** Worker job: fill a stub row from auth. */
export async function refreshStub(db: Executor, sub: string): Promise<"done" | "missing"> {
  const user = await fetchAuthUser(sub);
  if (!user || user.sub !== sub) return "missing";
  await upsertDirectoryUser(db, user, new Date(0));
  return "done";
}

export function displayName(user: Pick<DirectoryUser, "name" | "username" | "sub"> | null | undefined): string {
  return user?.name || user?.username || "Tretu-Spieler";
}

/**
 * For routes: the known, non-erased user or a 404 `user_not_found`. Read-only routes pass
 * `createStub: false` so probing random subs creates nothing when auth cannot be asked.
 */
export async function requireUser(
  db: Executor,
  sub: string,
  options: { createStub?: boolean } = {}
): Promise<DirectoryUser> {
  const value = sub.trim();
  const user = value && value.length <= 128 ? await ensureUser(db, value, options) : null;
  if (!user) throw notFound("user_not_found", "Unknown Tretu user.");
  return user;
}
