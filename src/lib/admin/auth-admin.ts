/**
 * Client for the auth.tretu.de admin API (central admin spec): signed as `tretu-web` (contract §3), 5 s
 * timeout, no caching. Responses are validated leniently (unknown fields are ignored, optional fields may be
 * missing) so a small shape difference on auth's side degrades a field instead of breaking the page.
 * Every failure becomes an {@link AuthAdminError} with a code the UI translates.
 */
import { z } from "zod";

import { log } from "@/lib/observability/logger";
import { authAdminConfigured, authRequest, AuthUnavailableError } from "@/lib/platform/directory";

export type AuthAdminErrorCode =
  | "not_configured"
  | "unavailable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "rate_limited";

export class AuthAdminError extends Error {
  constructor(
    public readonly code: AuthAdminErrorCode,
    /** auth's own error code / message (`{"error","message"}`), shown as a detail. */
    public readonly detail: string | null = null,
    public readonly status: number | null = null
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AuthAdminError";
  }
}

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

const linksSchema = z
  .object({
    discord: optStr,
    minecraft: optStr,
    minecraftName: optStr,
    steam: optStr,
    teamspeak: optStr,
  })
  .partial()
  .nullish()
  .transform((v) => ({
    discord: v?.discord ?? null,
    minecraft: v?.minecraft ?? null,
    minecraftName: v?.minecraftName ?? null,
    steam: v?.steam ?? null,
    teamspeak: v?.teamspeak ?? null,
  }));

export const adminUserSchema = z.object({
  sub: z.string().min(1).max(128),
  username: optStr,
  name: optStr,
  email: optStr,
  picture: optStr,
  createdAt: isoOrNull,
  lastSignInAt: isoOrNull,
  roles: z.array(z.string().max(64)).nullish().transform((v) => v ?? []),
  twoFactor: z.boolean().nullish().transform((v) => v ?? false),
  locked: z.boolean().nullish().transform((v) => v ?? false),
  links: linksSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

const searchSchema = z.object({
  items: z.array(adminUserSchema).max(500),
  nextCursor: optStr,
});
export type AdminSearchResult = z.infer<typeof searchSchema>;

const auditEntrySchema = z
  .looseObject({
    id: z.union([z.string(), z.number()]).nullish(),
    event: optStr,
    action: optStr,
    success: z.boolean().nullish(),
    createdAt: isoOrNull,
    ipAddress: optStr,
    meta: z.record(z.string(), z.unknown()).nullish(),
  })
  .transform((e) => ({
    id: e.id === null || e.id === undefined ? null : String(e.id),
    action: e.event ?? e.action ?? "unknown",
    success: e.success ?? true,
    createdAt: e.createdAt,
    ipAddress: e.ipAddress,
    meta: e.meta ?? null,
  }));
export type AuthAuditEntry = z.infer<typeof auditEntrySchema>;

export const adminUserDetailSchema = adminUserSchema.extend({
  emailVerified: z.boolean().nullish().transform((v) => v ?? false),
  providers: z
    .array(z.object({ provider: z.string().max(64), accountId: optStr, createdAt: isoOrNull }))
    .nullish()
    .transform((v) => v ?? []),
  passkeys: z
    .array(z.object({ id: z.union([z.string(), z.number()]).transform(String), name: optStr, createdAt: isoOrNull, lastUsedAt: isoOrNull }))
    .nullish()
    .transform((v) => v ?? []),
  sessions: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        createdAt: isoOrNull,
        expiresAt: isoOrNull,
        ipAddress: optStr,
        userAgent: optStr,
        client: optStr,
      })
    )
    .nullish()
    .transform((v) => v ?? []),
  legacyLinks: z
    .array(
      z.object({
        app: z.string().max(64),
        legacyUserId: z.union([z.string(), z.number()]).transform(String),
        legacyUsername: optStr,
        importedAt: isoOrNull,
        method: optStr,
      })
    )
    .nullish()
    .transform((v) => v ?? []),
  audit: z
    .array(z.unknown())
    .nullish()
    .transform((v) => (v ?? []).flatMap((entry) => {
      const parsed = auditEntrySchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    })),
  lockedReason: optStr,
  lockedUntil: isoOrNull,
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

const dayCount = z.array(z.object({ day: z.string().max(32), count: z.coerce.number() })).nullish().transform((v) => v ?? []);
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

/** One unmerged old account (same data as `npm run admin -- legacy`), normalised. */
export type LegacyCandidate = {
  sub: string;
  username: string | null;
  email: string | null;
  createdAt: string | null;
  legacy: { app: string; legacyUserId: string; legacyUsername: string | null; method: string | null }[];
  possibleMatches: { sub: string; username: string | null; email: string | null; reasons: string[] }[];
};

const legacyLinkSchema = z.looseObject({
  app: z.string().max(64),
  legacyUserId: z.union([z.string(), z.number()]).transform(String),
  legacyUsername: optStr,
  method: optStr,
});
const legacyCandidateSchema = z
  .looseObject({
    account: z
      .looseObject({
        id: z.string().nullish(),
        sub: z.string().nullish(),
        username: optStr,
        email: optStr,
        createdAt: isoOrNull,
        legacy: z.array(legacyLinkSchema).nullish(),
        legacyLinks: z.array(legacyLinkSchema).nullish(),
      })
      .nullish(),
    id: z.string().nullish(),
    sub: z.string().nullish(),
    username: optStr,
    email: optStr,
    createdAt: isoOrNull,
    legacy: z.array(legacyLinkSchema).nullish(),
    legacyLinks: z.array(legacyLinkSchema).nullish(),
    possibleMatches: z
      .array(
        z.looseObject({
          id: z.string().nullish(),
          sub: z.string().nullish(),
          username: optStr,
          email: optStr,
          reasons: z.array(z.string()).nullish(),
        })
      )
      .nullish(),
  })
  .transform((raw): LegacyCandidate | null => {
    const a = raw.account ?? raw;
    const sub = a.sub ?? a.id ?? raw.sub ?? raw.id;
    if (!sub) return null;
    const links = a.legacy ?? a.legacyLinks ?? raw.legacy ?? raw.legacyLinks ?? [];
    return {
      sub,
      username: a.username ?? null,
      email: a.email ?? null,
      createdAt: a.createdAt ?? null,
      legacy: links.map((l) => ({ app: l.app, legacyUserId: l.legacyUserId, legacyUsername: l.legacyUsername, method: l.method })),
      possibleMatches: (raw.possibleMatches ?? []).flatMap((m) => {
        const id = m.sub ?? m.id;
        return id ? [{ sub: id, username: m.username, email: m.email, reasons: m.reasons ?? [] }] : [];
      }),
    };
  });

function parseLegacyList(data: unknown): LegacyCandidate[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as Record<string, unknown>).items ?? (data as Record<string, unknown>).candidates ?? (data as Record<string, unknown>).accounts)
      : null;
  if (!Array.isArray(list)) throw new AuthAdminError("invalid", "legacy list has an unexpected shape");
  return list.flatMap((entry) => {
    const parsed = legacyCandidateSchema.safeParse(entry);
    return parsed.success && parsed.data ? [parsed.data] : [];
  });
}

/** Dry-run summary or merge result: kept as returned by auth and summarised for display (src/lib/admin/merge-summary.ts). */
export type MergeResponse = Record<string, unknown>;

/* --------------------------------- requests -------------------------------- */

async function errorDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    const parts = [body.error, body.message].filter((v): v is string => typeof v === "string" && v.length > 0);
    return parts.length ? parts.join(": ").slice(0, 300) : null;
  } catch {
    return null;
  }
}

async function call(method: "GET" | "POST", pathWithQuery: string, body?: unknown): Promise<unknown> {
  if (!authAdminConfigured()) throw new AuthAdminError("not_configured");
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
  const detail = await errorDetail(res);
  const code: AuthAdminErrorCode =
    res.status === 400 || res.status === 422
      ? "invalid"
      : res.status === 401
        ? "unauthorized"
        : res.status === 403
          ? "forbidden"
          : res.status === 404
            ? "not_found"
            : res.status === 409
              ? "conflict"
              : res.status === 429
                ? "rate_limited"
                : "unavailable";
  if (code === "unauthorized" || code === "unavailable") {
    // Signature / secret mismatch or auth down: an operator problem, worth a log line (no secrets in it).
    log("error", "admin.auth_request_failed", { method, status: res.status });
  }
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

export type MutationBase = { actorSub: string; reason: string };

export const authAdmin = {
  configured: authAdminConfigured,

  async search(q: string, options: { limit?: number; cursor?: string | null } = {}): Promise<AdminSearchResult> {
    const params = new URLSearchParams({ q, limit: String(Math.min(50, Math.max(1, options.limit ?? 50))) });
    if (options.cursor) params.set("cursor", options.cursor);
    return parse(searchSchema, await call("GET", `/api/v1/admin/users?${params.toString()}`), "search");
  },

  async user(sub: string): Promise<AdminUserDetail> {
    return parse(adminUserDetailSchema, await call("GET", `/api/v1/admin/users/${enc(sub)}`), "user");
  },

  async stats(): Promise<AdminStats> {
    return parse(adminStatsSchema, await call("GET", "/api/v1/admin/stats"), "stats");
  },

  async legacy(): Promise<LegacyCandidate[]> {
    return parseLegacyList(await call("GET", "/api/v1/admin/legacy"));
  },

  async setRoles(sub: string, body: MutationBase & { add?: string[]; remove?: string[] }): Promise<unknown> {
    return call("POST", `/api/v1/admin/users/${enc(sub)}/roles`, body);
  },
  async revokeSessions(sub: string, body: MutationBase): Promise<unknown> {
    return call("POST", `/api/v1/admin/users/${enc(sub)}/sessions/revoke`, body);
  },
  async lock(sub: string, body: MutationBase & { until?: string }): Promise<unknown> {
    return call("POST", `/api/v1/admin/users/${enc(sub)}/lock`, body);
  },
  async unlock(sub: string, body: MutationBase): Promise<unknown> {
    return call("POST", `/api/v1/admin/users/${enc(sub)}/unlock`, body);
  },
  async resetTwoFactor(sub: string, body: MutationBase): Promise<unknown> {
    return call("POST", `/api/v1/admin/users/${enc(sub)}/two-factor/reset`, body);
  },
  async removeLink(sub: string, body: MutationBase & { provider: string }): Promise<unknown> {
    return call("POST", `/api/v1/admin/users/${enc(sub)}/links/remove`, body);
  },
  async verifyEmail(sub: string, body: MutationBase): Promise<unknown> {
    return call("POST", `/api/v1/admin/users/${enc(sub)}/email/verify`, body);
  },
  async merge(body: MutationBase & { from: string; into: string; dryRun: boolean }): Promise<MergeResponse> {
    const data = await call("POST", "/api/v1/admin/merge", body);
    return data && typeof data === "object" && !Array.isArray(data) ? (data as MergeResponse) : { result: data };
  },
};
