/**
 * Client for the auth.tretu.de admin API (central admin spec; auth/app/api/v1/admin/**): signed as `tretu-web`
 * (contract §3, the only app auth accepts here), 5 s timeout, no caching. Every request names the acting admin
 * (`actorSub`: query parameter on reads, body field on changes); auth checks that this account holds `admin`
 * right now, is not locked and has two-factor sign-in on. Responses are validated leniently (unknown fields are
 * ignored, optional fields may be missing) so a small shape difference degrades a field instead of breaking the
 * page. Every failure becomes an {@link AuthAdminError} with a code the UI translates.
 */
import { z } from "zod";

import { log } from "@/lib/observability/logger";
import { authAdminConfigured, authRequest, AuthUnavailableError } from "@/lib/platform/directory";

/** auth's own refusal codes (`{"error": code}`), passed through so the UI can explain each one. */
export const AUTH_REFUSAL_CODES = [
  "forbidden_app",
  "actor_not_admin",
  "actor_two_factor_required",
  "self_action",
  "last_admin",
  "last_sign_in_method",
  "no_email",
  "merge_refused",
  "payload_too_large",
] as const;
export type AuthRefusalCode = (typeof AUTH_REFUSAL_CODES)[number];

export type AuthAdminErrorCode =
  | "not_configured"
  | "unavailable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "rate_limited"
  | AuthRefusalCode;

/** The acting admin's own account is the problem (not the target): shown as a banner, not as a failed action. */
export const ACTOR_ERRORS: ReadonlySet<AuthAdminErrorCode> = new Set(["actor_not_admin", "actor_two_factor_required"]);

export class AuthAdminError extends Error {
  constructor(
    public readonly code: AuthAdminErrorCode,
    /** auth's message (`{"error","message"}`), shown as a detail. */
    public readonly detail: string | null = null,
    public readonly status: number | null = null
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AuthAdminError";
  }
}

/** auth refuses bodies over 16 KB (413); reasons are capped at 500 characters, so this only guards against bugs. */
export const MAX_BODY_BYTES = 16 * 1024;
/** auth's page size limits for the user search. */
export const SEARCH_LIMIT_MAX = 100;

/* ---------------------------------- shapes --------------------------------- */

const str = z.string().max(4000);
const optStr = str.nullish().transform((v) => v ?? null);
const isoOrNull = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });
const idString = z.union([z.string(), z.number()]).transform(String);
const bool = z.boolean().nullish().transform((v) => v ?? false);
const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v): z.infer<T>[] => v ?? []);

/** `links` of the user shape (auth `UserLinks`); absent links are null. */
const linksSchema = z
  .object({
    discord: optStr,
    minecraft: optStr,
    minecraftName: optStr,
    steam: optStr,
    teamspeak: optStr,
    teamspeakName: optStr,
  })
  .partial()
  .nullish()
  .transform((v) => ({
    discord: v?.discord ?? null,
    minecraft: v?.minecraft ?? null,
    minecraftName: v?.minecraftName ?? null,
    steam: v?.steam ?? null,
    teamspeak: v?.teamspeak ?? null,
    teamspeakName: v?.teamspeakName ?? null,
  }));

/** One account of the search (auth `AdminUserItem`); `email` is null for accounts without a real address. */
export const adminUserSchema = z.object({
  sub: z.string().min(1).max(128),
  username: optStr,
  name: optStr,
  email: optStr,
  picture: optStr,
  createdAt: isoOrNull,
  lastSignInAt: isoOrNull,
  roles: list(z.string().max(64)),
  twoFactor: bool,
  locked: bool,
  links: linksSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

const searchSchema = z.object({
  items: z.array(adminUserSchema).max(SEARCH_LIMIT_MAX),
  nextCursor: optStr,
});
export type AdminSearchResult = z.infer<typeof searchSchema>;

/** An entry of auth's activity log (`audit_log`): `admin.*` entries carry the admin and the reason in `meta`. */
const auditEntrySchema = z
  .looseObject({
    id: idString.nullish(),
    event: optStr,
    success: z.boolean().nullish(),
    createdAt: isoOrNull,
    ipAddress: optStr,
    userAgent: optStr,
    meta: z.record(z.string(), z.unknown()).nullish(),
  })
  .transform((e) => ({
    id: e.id ?? null,
    action: e.event ?? "unknown",
    success: e.success ?? true,
    createdAt: e.createdAt,
    ipAddress: e.ipAddress,
    meta: e.meta ?? null,
  }));
export type AuthAuditEntry = z.infer<typeof auditEntrySchema>;

/** Sign-in methods auth reports (`password` has no account id). */
export const SIGN_IN_PROVIDERS = ["password", "discord", "google", "apple", "steam"] as const;
/** What `POST …/links/remove` accepts: sign-in identities except the password, and the game links. */
export const REMOVABLE_LINKS = ["discord", "google", "apple", "steam", "minecraft", "teamspeak"] as const;
export type RemovableLink = (typeof REMOVABLE_LINKS)[number];
export const isRemovableLink = (value: string): value is RemovableLink => (REMOVABLE_LINKS as readonly string[]).includes(value);

/** Everything about one account (auth `AdminUserDetail`). */
export const adminUserDetailSchema = adminUserSchema.extend({
  emailVerified: bool,
  locale: z.enum(["de", "en"]).nullish().catch(null).transform((v) => v ?? null),
  lockedReason: optStr,
  lockedUntil: isoOrNull,
  lockedAt: isoOrNull,
  providers: list(z.object({ provider: z.string().max(64), accountId: optStr, displayName: optStr, createdAt: isoOrNull })),
  passkeys: list(z.object({ id: idString, name: optStr, createdAt: isoOrNull, lastUsedAt: isoOrNull })),
  /** Active sessions at auth; `client` is the app that last got tokens through the session. */
  sessions: list(z.object({ id: idString, createdAt: isoOrNull, expiresAt: isoOrNull, ipAddress: optStr, userAgent: optStr, client: optStr })),
  legacyLinks: list(z.object({ app: z.string().max(64), legacyUserId: idString, legacyUsername: optStr, importedAt: isoOrNull, method: optStr })),
  /** The newest 50 entries of auth's activity log; unreadable entries are skipped. */
  audit: z
    .array(z.unknown())
    .nullish()
    .transform((v) =>
      (v ?? []).flatMap((entry) => {
        const parsed = auditEntrySchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
    ),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

const dayCount = list(z.object({ day: z.string().max(32), count: z.coerce.number() }));
/** auth's account numbers: 90 Europe/Berlin days, oldest first; sign-ins count each account once a day. */
export const adminStatsSchema = z.object({
  users: z.object({
    total: z.coerce.number(),
    verified: z.coerce.number().nullish().transform((v) => v ?? 0),
    withTwoFactor: z.coerce.number().nullish().transform((v) => v ?? 0),
    locked: z.coerce.number().nullish().transform((v) => v ?? 0),
    admins: z.coerce.number().nullish().transform((v) => v ?? 0),
  }),
  signUpsPerDay: dayCount,
  signInsPerDay: dayCount,
  providers: z.record(z.string(), z.coerce.number()).nullish().transform((v) => v ?? {}),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

/**
 * auth's `AccountSummary` (lib/legacy/admin.ts): used by the legacy list and the merge plan. Dates arrive as ISO
 * strings; `providers[].providerId` is `credential` for the password.
 */
const accountSummarySchema = z.looseObject({
  id: z.string().min(1).max(128),
  username: optStr,
  email: optStr,
  emailVerified: bool,
  createdAt: isoOrNull,
  lastLoginAt: isoOrNull,
  roles: list(z.string().max(64)),
  twoFactor: bool,
  providers: list(z.looseObject({ providerId: z.string().max(64), accountId: optStr, displayName: optStr })),
  gameLinks: list(z.looseObject({ provider: z.string().max(64), providerAccountId: optStr, displayName: optStr })),
  passkeys: list(z.looseObject({ id: idString, name: optStr, createdAt: isoOrNull })),
  legacy: list(
    z.looseObject({ app: z.string().max(64), legacyUserId: idString, legacyUsername: optStr, legacyEmail: optStr, method: optStr })
  ),
  usedByApps: bool,
  sessions: z.coerce.number().nullish().transform((v) => v ?? 0),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

/** One unmerged old account of `GET /api/v1/admin/legacy` (same data as `npm run admin -- legacy`). */
const legacyCandidateSchema = z
  .object({
    account: accountSummarySchema,
    possibleMatches: list(
      z.object({ id: z.string().min(1).max(128), username: optStr, email: optStr, reasons: list(z.string().max(32)) })
    ),
  })
  .transform((c) => ({
    sub: c.account.id,
    username: c.account.username,
    email: c.account.email,
    createdAt: c.account.createdAt,
    lastLoginAt: c.account.lastLoginAt,
    usedByApps: c.account.usedByApps,
    legacy: c.account.legacy.map((l) => ({ app: l.app, legacyUserId: l.legacyUserId, legacyUsername: l.legacyUsername, method: l.method })),
    possibleMatches: c.possibleMatches.map((m) => ({ sub: m.id, username: m.username, email: m.email, reasons: m.reasons })),
  }));
export type LegacyCandidate = z.infer<typeof legacyCandidateSchema>;

const legacyListSchema = z.object({ items: z.array(z.unknown()).max(10_000) });

/** auth's `MergePlan`: what moves from `from` to `into`, and what is dropped because `into` already has one. */
export const mergePlanSchema = z.looseObject({
  from: accountSummarySchema,
  into: accountSummarySchema,
  move: z.looseObject({
    providers: accountSummarySchema.shape.providers,
    gameLinks: accountSummarySchema.shape.gameLinks,
    passkeys: accountSummarySchema.shape.passkeys,
    legacy: accountSummarySchema.shape.legacy,
  }),
  drop: z.looseObject({ providers: accountSummarySchema.shape.providers, gameLinks: accountSummarySchema.shape.gameLinks }),
});
export type MergePlan = z.infer<typeof mergePlanSchema>;

const mergeSchema = z.union([
  z.object({ ok: z.literal(true), dryRun: z.literal(true), plan: mergePlanSchema }),
  z.object({ ok: z.literal(true), dryRun: z.literal(false), merged: z.literal(true), plan: mergePlanSchema, user: adminUserSchema.nullish() }),
]);
/** `{ok, dryRun: true, plan}` (preview) or `{ok, dryRun: false, merged: true, plan, user}` (done). */
export type MergeResponse = z.infer<typeof mergeSchema>;

/**
 * Answer of every account change: `changed: false` when there was nothing to do (auth then records nothing),
 * `user` = the account afterwards (list item shape).
 */
const mutationSchema = z.looseObject({ ok: z.literal(true), changed: z.boolean(), user: adminUserSchema.nullish() });
export type MutationResult = { changed: boolean; user: AdminUser | null };

/* --------------------------------- requests -------------------------------- */

const knownRefusal = (code: unknown): code is AuthRefusalCode => typeof code === "string" && (AUTH_REFUSAL_CODES as readonly string[]).includes(code);

async function readError(res: Response): Promise<{ code: string | null; message: string | null }> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    return {
      code: typeof body.error === "string" ? body.error.slice(0, 64) : null,
      message: typeof body.message === "string" && body.message ? body.message.slice(0, 300) : null,
    };
  } catch {
    return { code: null, message: null };
  }
}

function statusCode(status: number): AuthAdminErrorCode {
  if (status === 400 || status === 422) return "invalid";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

async function call(method: "GET" | "POST", pathWithQuery: string, body?: unknown): Promise<unknown> {
  if (!authAdminConfigured()) throw new AuthAdminError("not_configured");
  if (body !== undefined && Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) throw new AuthAdminError("payload_too_large");
  let res: Response;
  try {
    res = await authRequest(method, pathWithQuery, body);
  } catch (error) {
    if (error instanceof AuthUnavailableError) throw new AuthAdminError("not_configured");
    log("warn", "admin.auth_unreachable", { method, error: error instanceof Error ? error.name : "unknown" });
    throw new AuthAdminError("unavailable");
  }
  if (res.ok) {
    try {
      return await res.json();
    } catch {
      throw new AuthAdminError("unavailable", "invalid JSON from auth", res.status);
    }
  }
  const { code: authCode, message } = await readError(res);
  const code: AuthAdminErrorCode = knownRefusal(authCode) ? authCode : statusCode(res.status);
  if (code === "unauthorized" || code === "unavailable" || code === "forbidden_app") {
    // Signature / secret / app id mismatch or auth down: an operator problem, worth a log line (no secrets in it).
    log("error", "admin.auth_request_failed", { method, status: res.status, error: authCode ?? "none" });
  }
  // Unknown codes stay visible as detail (e.g. `invalid_request: reason must be …`).
  const detail = [knownRefusal(authCode) ? null : authCode, message].filter(Boolean).join(": ") || null;
  throw new AuthAdminError(code, detail, res.status);
}

function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    log("error", "admin.auth_invalid_response", { what, issues: parsed.error.issues.length });
    throw new AuthAdminError("unavailable", `unexpected ${what} response from auth`);
  }
  return parsed.data;
}

const enc = encodeURIComponent;

/**
 * Path plus query for a read, always with the acting admin. Encoded once with URLSearchParams and signed exactly
 * as sent (authRequest signs `url.pathname + url.search` of the URL it fetches).
 */
function readPath(path: string, actorSub: string, params: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  query.set("actorSub", actorSub);
  return `${path}?${query.toString()}`;
}

async function mutate(path: string, body: MutationBase & Record<string, unknown>): Promise<MutationResult> {
  const result = parse(mutationSchema, await call("POST", path, body), "mutation");
  return { changed: result.changed, user: result.user ?? null };
}

export type MutationBase = { actorSub: string; reason: string };

export const authAdmin = {
  configured: authAdminConfigured,

  /** Search (cursor pagination; a cursor only continues the same `q`). */
  async search(actorSub: string, q: string, options: { limit?: number; cursor?: string | null } = {}): Promise<AdminSearchResult> {
    const limit = String(Math.min(SEARCH_LIMIT_MAX, Math.max(1, Math.trunc(options.limit ?? 50))));
    return parse(searchSchema, await call("GET", readPath("/api/v1/admin/users", actorSub, { q, limit, cursor: options.cursor })), "search");
  },

  async user(actorSub: string, sub: string): Promise<AdminUserDetail> {
    return parse(adminUserDetailSchema, await call("GET", readPath(`/api/v1/admin/users/${enc(sub)}`, actorSub)), "user");
  },

  async stats(actorSub: string): Promise<AdminStats> {
    return parse(adminStatsSchema, await call("GET", readPath("/api/v1/admin/stats", actorSub)), "stats");
  },

  async legacy(actorSub: string): Promise<LegacyCandidate[]> {
    const { items } = parse(legacyListSchema, await call("GET", readPath("/api/v1/admin/legacy", actorSub)), "legacy");
    return items.flatMap((entry) => {
      const parsed = legacyCandidateSchema.safeParse(entry);
      if (!parsed.success) log("warn", "admin.legacy_item_skipped", { issues: parsed.error.issues.length });
      return parsed.success ? [parsed.data] : [];
    });
  },

  setRoles: (sub: string, body: MutationBase & { add?: string[]; remove?: string[] }) => mutate(`/api/v1/admin/users/${enc(sub)}/roles`, body),
  revokeSessions: (sub: string, body: MutationBase) => mutate(`/api/v1/admin/users/${enc(sub)}/sessions/revoke`, body),
  lock: (sub: string, body: MutationBase & { until?: string }) => mutate(`/api/v1/admin/users/${enc(sub)}/lock`, body),
  unlock: (sub: string, body: MutationBase) => mutate(`/api/v1/admin/users/${enc(sub)}/unlock`, body),
  resetTwoFactor: (sub: string, body: MutationBase) => mutate(`/api/v1/admin/users/${enc(sub)}/two-factor/reset`, body),
  removeLink: (sub: string, body: MutationBase & { provider: RemovableLink }) => mutate(`/api/v1/admin/users/${enc(sub)}/links/remove`, body),
  verifyEmail: (sub: string, body: MutationBase) => mutate(`/api/v1/admin/users/${enc(sub)}/email/verify`, body),

  async merge(body: MutationBase & { from: string; into: string; dryRun: boolean }): Promise<MergeResponse> {
    return parse(mergeSchema, await call("POST", "/api/v1/admin/merge", body), "merge");
  },
};
