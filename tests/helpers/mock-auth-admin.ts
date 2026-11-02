/**
 * In-memory stand-in for the auth.tretu.de admin API, used by the unit tests and the mocked Playwright server. It
 * mirrors the real implementation (auth/lib/admin/http.ts, users.ts, actions.ts, auth/lib/legacy/admin.ts) in
 * every shape, status and refusal the hub relies on; tests/e2e-real/** runs the hub against the real auth.
 *
 * - Signed per contract §3 (production verifier); the query may be signed as URLSearchParams or as
 *   encodeURIComponent encodes it. Unknown app or bad signature → 401, a known app other than `tretu-web` → 403
 *   `forbidden_app`, bodies over 16 KB → 413.
 * - The acting admin (`actorSub`: query parameter on reads, optional; body field on changes, required) must hold
 *   `admin`, not be locked (`actor_not_admin`) and have 2FA (`actor_two_factor_required`).
 * - Changes answer `{ ok, changed, …, user }`; `changed: false` is not recorded in the activity log.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { verifySignature } from "../../src/lib/platform/signing";

export type MockProvider = { provider: "credential" | "discord" | "google" | "apple" | "steam"; accountId: string; displayName?: string | null; createdAt: string };

export type MockUser = {
  sub: string;
  username: string | null;
  name: string;
  /** null = no real address (auth stores a placeholder). */
  email: string | null;
  emailVerified: boolean;
  picture: string | null;
  locale: "de" | "en";
  createdAt: string;
  lastSignInAt: string | null;
  roles: string[];
  twoFactor: boolean;
  locked: boolean;
  lockedReason: string | null;
  lockedUntil: string | null;
  lockedAt: string | null;
  /** The user shape's links (discord/steam mirror the sign-in providers, minecraft/teamspeak are game links). */
  links: { discord?: string; minecraft?: string; minecraftName?: string; steam?: string; teamspeak?: string; teamspeakName?: string };
  providers: MockProvider[];
  passkeys: { id: string; name: string | null; createdAt: string; lastUsedAt: string | null }[];
  sessions: { id: string; createdAt: string; expiresAt: string; ipAddress?: string | null; userAgent?: string | null; client?: string | null }[];
  legacyLinks: { app: string; legacyUserId: string; legacyUsername: string | null; legacyEmail?: string | null; importedAt: string; method: string }[];
  /** Activity log, oldest first. */
  audit: { id: string; event: string; success: boolean; ipAddress?: string | null; userAgent?: string | null; meta?: Record<string, unknown> | null; createdAt: string }[];
};

export type RecordedRequest = { method: string; path: string; app: string | null; body: Record<string, unknown> | null };

export function mockUser(partial: Partial<MockUser> & { sub: string }): MockUser {
  return {
    username: null,
    name: partial.username ?? "Tretu",
    email: null,
    emailVerified: false,
    picture: null,
    locale: "de",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: null,
    roles: [],
    twoFactor: false,
    locked: false,
    lockedReason: null,
    lockedUntil: null,
    lockedAt: null,
    links: {},
    providers: [{ provider: "credential", accountId: partial.sub, createdAt: "2026-01-01T00:00:00.000Z" }],
    passkeys: [],
    sessions: [],
    legacyLinks: [],
    audit: [],
    ...partial,
  };
}

export type MockAuth = {
  url: string;
  users: Map<string, MockUser>;
  requests: RecordedRequest[];
  /** Answer every signed request with this status (e.g. 503) until reset to null. */
  failWith: number | null;
  close(): Promise<void>;
};

const MAX_BODY_BYTES = 16 * 1024;
const SEARCH_LIMIT_MAX = 100;
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const REMOVABLE_LINKS = ["discord", "google", "apple", "steam", "minecraft", "teamspeak"];
const STATS_DAYS = 90;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

type Failure = { status: number; error: string; message?: string };
const fail = (status: number, error: string, message?: string): Failure => ({ status, error, ...(message ? { message } : {}) });
const isFailure = (value: unknown): value is Failure => Boolean(value && typeof value === "object" && "status" in value && "error" in value);

const isAdmin = (u: MockUser) => u.roles.includes("admin");
const lockActive = (u: MockUser, now = new Date()) => u.locked && (!u.lockedUntil || Date.parse(u.lockedUntil) > now.getTime());

function item(u: MockUser) {
  return {
    sub: u.sub,
    username: u.username,
    name: u.name,
    email: u.email,
    picture: u.picture,
    createdAt: u.createdAt,
    lastSignInAt: u.lastSignInAt,
    roles: u.roles,
    twoFactor: u.twoFactor,
    locked: lockActive(u),
    links: u.links,
  };
}

function detail(u: MockUser) {
  const now = Date.now();
  return {
    ...item(u),
    emailVerified: u.emailVerified && u.email !== null,
    locale: u.locale,
    lockedReason: u.locked ? u.lockedReason : null,
    lockedUntil: u.locked ? u.lockedUntil : null,
    lockedAt: u.locked ? u.lockedAt : null,
    providers: u.providers.map((p) => ({
      provider: p.provider === "credential" ? "password" : p.provider,
      accountId: p.provider === "credential" ? null : p.accountId,
      displayName: p.displayName ?? null,
      createdAt: p.createdAt,
    })),
    passkeys: u.passkeys,
    sessions: u.sessions
      .filter((s) => Date.parse(s.expiresAt) > now)
      .map((s) => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, ipAddress: s.ipAddress ?? null, userAgent: s.userAgent ?? null, client: s.client ?? null })),
    legacyLinks: u.legacyLinks.map(({ app, legacyUserId, legacyUsername, importedAt, method }) => ({ app, legacyUserId, legacyUsername, importedAt, method })),
    audit: u.audit
      .slice(-50)
      .reverse()
      .map((a) => ({ id: a.id, event: a.event, success: a.success, ipAddress: a.ipAddress ?? null, userAgent: a.userAgent ?? null, meta: a.meta ?? null, createdAt: a.createdAt })),
  };
}

/** auth's `AccountSummary` (legacy list and merge plan). */
function accountSummary(u: MockUser) {
  return {
    id: u.sub,
    username: u.username,
    email: u.email,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
    lastLoginAt: u.lastSignInAt,
    roles: u.roles,
    twoFactor: u.twoFactor,
    providers: [...u.providers]
      .sort((a, b) => a.provider.localeCompare(b.provider))
      .map((p) => ({ id: `acc-${u.sub}-${p.provider}`, providerId: p.provider, accountId: p.accountId, displayName: p.displayName ?? null })),
    gameLinks: [
      ...(u.links.minecraft ? [{ id: `ext-${u.sub}-mc`, provider: "minecraft", providerAccountId: u.links.minecraft, displayName: u.links.minecraftName ?? null }] : []),
      ...(u.links.teamspeak ? [{ id: `ext-${u.sub}-ts`, provider: "teamspeak", providerAccountId: u.links.teamspeak, displayName: u.links.teamspeakName ?? null }] : []),
    ],
    passkeys: u.passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt })),
    legacy: u.legacyLinks.map((l) => ({ id: `legacy-${l.app}-${l.legacyUserId}`, app: l.app, legacyUserId: l.legacyUserId, legacyUsername: l.legacyUsername, legacyEmail: l.legacyEmail ?? null, method: l.method })),
    usedByApps: u.sessions.some((s) => s.client),
    sessions: u.sessions.length,
  };
}

function identifiers(u: MockUser): string[] {
  return [u.sub, u.username, u.name, u.email, ...u.providers.filter((p) => p.provider !== "credential").map((p) => p.accountId), u.links.minecraft, u.links.minecraftName, u.links.teamspeak, u.links.teamspeakName]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());
}

const berlinDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

function lastDays(now: Date): string[] {
  const [y, m, d] = berlinDay.format(now).split("-").map(Number) as [number, number, number];
  return Array.from({ length: STATS_DAYS }, (_, i) => new Date(Date.UTC(y, m - 1, d - (STATS_DAYS - 1 - i))).toISOString().slice(0, 10));
}

/** The forms of the signed `pathWithQuery` auth recognises (auth/lib/tretu/admin-api.ts `signedPathCandidates`). */
function signedPathCandidates(url: URL): string[] {
  const params = [...url.searchParams];
  if (!params.length) return [url.pathname];
  const asUrlSearchParams = `${url.pathname}?${url.searchParams.toString()}`;
  const reencoded = `${url.pathname}?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
  return reencoded === asUrlSearchParams ? [asUrlSearchParams] : [asUrlSearchParams, reencoded];
}

export async function startMockAuth(options: { secret: string; users?: MockUser[]; port?: number; otherApps?: Record<string, string> }): Promise<MockAuth> {
  const users = new Map((options.users ?? []).map((u) => [u.sub, u]));
  const secrets: Record<string, string> = { ...(options.otherApps ?? {}), "tretu-web": options.secret };
  const requests: RecordedRequest[] = [];
  let auditId = 1;
  const state: { failWith: number | null } = { failWith: null };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const sendFailure = (res: ServerResponse, f: Failure) => send(res, f.status, { error: f.error, ...(f.message ? { message: f.message } : {}) });

  const record = (u: MockUser, event: string, meta: Record<string, unknown>) =>
    u.audit.push({ id: `audit-${auditId++}`, event, success: true, createdAt: new Date().toISOString(), meta });
  /** auth/lib/admin/audit.ts `recordAdminAction`: on the target, and `admin.performed` on the actor. */
  const recordAdmin = (actor: MockUser, target: MockUser, action: string, reason: string, details: Record<string, unknown> = {}) => {
    record(target, `admin.${action}`, { by: "api", actorSub: actor.sub, actorUsername: actor.username, reason, ...details });
    if (actor.sub !== target.sub) record(actor, "admin.performed", { action, targetSub: target.sub, targetUsername: target.username, reason, ...details });
  };

  /** auth/lib/admin/http.ts `resolveActor`. */
  function resolveActor(sub: unknown): MockUser | Failure {
    if (typeof sub !== "string" || sub.length < 1 || sub.length > 64) return fail(400, "invalid_request", "actorSub is invalid");
    const actor = users.get(sub);
    if (!actor || !isAdmin(actor) || lockActive(actor)) return fail(403, "actor_not_admin", "The acting account does not hold the admin role");
    if (!actor.twoFactor) return fail(403, "actor_two_factor_required", "The acting admin must have two-factor sign-in turned on");
    return actor;
  }

  const otherActiveAdmin = (targetSub: string) => [...users.values()].some((u) => u.sub !== targetSub && isAdmin(u) && !lockActive(u));

  function search(url: URL): unknown {
    const q = (url.searchParams.get("q") ?? "").trim();
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw === null ? 50 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_LIMIT_MAX) return fail(400, "invalid_request", "limit: 1–100");
    if (q.length > 200) return fail(400, "invalid_request", "q: at most 200 characters");
    let after: [number, string, string] | null = null;
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
        if (!Array.isArray(parsed) || parsed.length !== 3) throw new Error("shape");
        after = parsed as [number, string, string];
      } catch {
        return fail(400, "invalid_request", "cursor is invalid");
      }
    }
    const lower = q.toLowerCase();
    const hits = [...users.values()]
      .map((u) => ({ u, ids: identifiers(u) }))
      .filter(({ ids }) => !q || ids.some((id) => id.includes(lower)))
      .map(({ u, ids }) => ({ u, exact: q && ids.includes(lower) ? 1 : 0 }))
      // Exact matches first, then the newest (auth: `order by exact desc, created_at desc, id desc`).
      .sort((a, b) => b.exact - a.exact || b.u.createdAt.localeCompare(a.u.createdAt) || b.u.sub.localeCompare(a.u.sub));
    const position = (h: { u: MockUser; exact: number }): [number, string, string] => [h.exact, h.u.createdAt, h.u.sub];
    const before = (a: [number, string, string], b: [number, string, string]) =>
      a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
    const rest = after ? hits.filter((h) => before(position(h), after)) : hits;
    const page = rest.slice(0, limit);
    const last = page.at(-1);
    const nextCursor = rest.length > limit && last ? Buffer.from(JSON.stringify(position(last))).toString("base64url") : null;
    return { items: page.map((h) => item(h.u)), nextCursor };
  }

  function stats(): unknown {
    const all = [...users.values()];
    const days = lastDays(new Date());
    const signUps = new Map<string, number>();
    for (const u of all) {
      const day = berlinDay.format(new Date(u.createdAt));
      signUps.set(day, (signUps.get(day) ?? 0) + 1);
    }
    const signIns = new Map<string, Set<string>>();
    for (const u of all)
      for (const a of u.audit)
        if (a.event === "login" && a.success) {
          const day = berlinDay.format(new Date(a.createdAt));
          signIns.set(day, (signIns.get(day) ?? new Set()).add(u.sub));
        }
    const withProvider = (p: string) => all.filter((u) => u.providers.some((x) => x.provider === p)).length;
    return {
      users: {
        total: all.length,
        verified: all.filter((u) => u.emailVerified && u.email !== null).length,
        withTwoFactor: all.filter((u) => u.twoFactor).length,
        locked: all.filter((u) => lockActive(u)).length,
        admins: all.filter(isAdmin).length,
      },
      signUpsPerDay: days.map((day) => ({ day, count: signUps.get(day) ?? 0 })),
      signInsPerDay: days.map((day) => ({ day, count: signIns.get(day)?.size ?? 0 })),
      providers: {
        password: withProvider("credential"),
        discord: withProvider("discord"),
        google: withProvider("google"),
        apple: withProvider("apple"),
        steam: withProvider("steam"),
        passkey: all.filter((u) => u.passkeys.length).length,
      },
    };
  }

  /** auth/lib/legacy/admin.ts `listLegacyAccounts`. */
  function legacy(): unknown {
    const stem = (name: string) => name.toLowerCase().replace(/_\d{1,4}$/, "");
    const all = [...users.values()];
    const emailsOf = new Map<string, Set<string>>();
    const namesOf = new Map<string, Set<string>>();
    const add = (map: Map<string, Set<string>>, sub: string, value: string | null | undefined) => {
      if (value) map.set(sub, (map.get(sub) ?? new Set()).add(value));
    };
    for (const u of all) {
      add(emailsOf, u.sub, u.email?.toLowerCase());
      add(namesOf, u.sub, u.username ? stem(u.username) : null);
      for (const l of u.legacyLinks) {
        add(emailsOf, u.sub, l.legacyEmail?.toLowerCase());
        add(namesOf, u.sub, l.legacyUsername ? stem(l.legacyUsername) : null);
      }
    }
    const items = all
      .filter((u) => u.legacyLinks.length && !u.legacyLinks.some((l) => l.method === "admin"))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((u) => {
        const possibleMatches = all
          .filter((o) => o.sub !== u.sub)
          .map((o) => {
            const reasons: string[] = [];
            if ([...(emailsOf.get(u.sub) ?? [])].some((e) => emailsOf.get(o.sub)?.has(e))) reasons.push("email");
            if ([...(namesOf.get(u.sub) ?? [])].some((n) => namesOf.get(o.sub)?.has(n))) reasons.push("username");
            return { id: o.sub, username: o.username, email: o.email, reasons };
          })
          .filter((m) => m.reasons.length);
        return { account: accountSummary(u), possibleMatches };
      })
      .sort((a, b) => Number(b.possibleMatches.length > 0) - Number(a.possibleMatches.length > 0));
    return { items };
  }

  function mergePlan(from: MockUser, into: MockUser) {
    const f = accountSummary(from);
    const i = accountSummary(into);
    const intoProviders = new Set(i.providers.map((p) => p.providerId));
    const intoGames = new Set(i.gameLinks.map((g) => g.provider));
    return {
      from: f,
      into: i,
      move: { providers: f.providers.filter((p) => !intoProviders.has(p.providerId)), gameLinks: f.gameLinks.filter((g) => !intoGames.has(g.provider)), passkeys: f.passkeys, legacy: f.legacy },
      drop: { providers: f.providers.filter((p) => intoProviders.has(p.providerId)), gameLinks: f.gameLinks.filter((g) => intoGames.has(g.provider)) },
    };
  }

  function merge(actor: MockUser, body: Record<string, unknown>, reason: string): unknown {
    if (typeof body.from !== "string" || typeof body.into !== "string" || typeof body.dryRun !== "boolean") return fail(400, "invalid_request", "from, into and dryRun are required");
    const from = users.get(body.from);
    const into = users.get(body.into);
    if (!from || !into) return fail(404, "not_found", "No Tretu-Konto with this sub");
    if (from.sub === into.sub) return fail(409, "merge_refused", "from and into are the same account");
    if (isAdmin(from)) return fail(409, "merge_refused", "from has the admin role; remove it first if this account really should go");
    const plan = mergePlan(from, into);
    if (body.dryRun) return { ok: true, dryRun: true, plan };
    const intoProviders = new Set(into.providers.map((p) => p.provider));
    into.providers.push(...from.providers.filter((p) => !intoProviders.has(p.provider)));
    if (!into.links.minecraft && from.links.minecraft) Object.assign(into.links, { minecraft: from.links.minecraft, minecraftName: from.links.minecraftName });
    if (!into.links.teamspeak && from.links.teamspeak) Object.assign(into.links, { teamspeak: from.links.teamspeak, teamspeakName: from.links.teamspeakName });
    for (const p of into.providers) if (p.provider === "discord" || p.provider === "steam") into.links[p.provider] ??= p.accountId;
    into.passkeys.push(...from.passkeys);
    into.legacyLinks.push(...from.legacyLinks.map((l) => ({ ...l, method: "admin" })));
    users.delete(from.sub);
    recordAdmin(actor, into, "merge", reason, { from: from.sub, fromUsername: from.username });
    return { ok: true, dryRun: false, merged: true, plan, user: item(into) };
  }

  /** One account change (auth/lib/admin/actions.ts); the result's extra fields go next to `changed`. */
  function change(actor: MockUser, target: MockUser, action: string, body: Record<string, unknown>, reason: string): Failure | { changed: boolean; extra?: Record<string, unknown> } {
    const self = actor.sub === target.sub;
    switch (action) {
      case "roles": {
        const roleList = (v: unknown) => (v === undefined ? [] : Array.isArray(v) && v.length <= 16 && v.every((r) => typeof r === "string" && ROLE_PATTERN.test(r)) ? (v as string[]) : null);
        const add = roleList(body.add);
        const remove = roleList(body.remove);
        if (!add || !remove) return fail(400, "invalid_request", "roles are lowercase names (a-z, 0-9, _ and -)");
        if (!add.length && !remove.length) return fail(400, "invalid_request", "add or remove at least one role");
        if (add.some((r) => remove.includes(r))) return fail(400, "invalid_request", "a role cannot be added and removed at once");
        const roles = [...new Set([...target.roles.filter((r) => !remove.includes(r)), ...add])];
        const demoted = isAdmin(target) && !roles.includes("admin");
        if (demoted && self) return fail(403, "self_action", "Admins cannot remove the admin role from themselves");
        if (demoted && !otherActiveAdmin(target.sub)) return fail(409, "last_admin", "This is the last admin who is not locked");
        const before = target.roles;
        const changed = roles.length !== before.length || roles.some((r) => !before.includes(r));
        target.roles = roles;
        if (changed) recordAdmin(actor, target, "roles_changed", reason, { roles, added: roles.filter((r) => !before.includes(r)), removed: before.filter((r) => !roles.includes(r)) });
        return { changed };
      }
      case "sessions/revoke": {
        const sessions = target.sessions.length;
        target.sessions = [];
        if (sessions) recordAdmin(actor, target, "sessions_revoked", reason, { sessions, tokens: 0 });
        return { changed: sessions > 0, extra: { revoked: { sessions, tokens: 0 } } };
      }
      case "lock": {
        const until = body.until ?? null;
        if (until !== null && (typeof until !== "string" || !ISO_WITH_OFFSET.test(until) || Number.isNaN(Date.parse(until)))) return fail(400, "invalid_request", "until: ISO date");
        if (typeof until === "string" && Date.parse(until) <= Date.now()) return fail(400, "invalid_request", "until must be in the future");
        if (self) return fail(403, "self_action", "Admins cannot lock themselves");
        if (isAdmin(target) && !otherActiveAdmin(target.sub)) return fail(409, "last_admin", "This is the last admin who is not locked");
        const untilIso = typeof until === "string" ? new Date(until).toISOString() : null;
        const wasActive = lockActive(target);
        if (wasActive && target.lockedReason === reason && target.lockedUntil === untilIso) return { changed: false, extra: { lockedUntil: untilIso } };
        Object.assign(target, { locked: true, lockedReason: reason, lockedUntil: untilIso, lockedAt: wasActive ? target.lockedAt : new Date().toISOString() });
        const sessions = target.sessions.length;
        target.sessions = [];
        recordAdmin(actor, target, "locked", reason, { until: untilIso, sessions, tokens: 0 });
        return { changed: true, extra: { lockedUntil: untilIso } };
      }
      case "unlock": {
        if (!target.locked) return { changed: false };
        Object.assign(target, { locked: false, lockedReason: null, lockedUntil: null, lockedAt: null });
        recordAdmin(actor, target, "unlocked", reason);
        return { changed: true };
      }
      case "two-factor/reset": {
        if (!target.twoFactor) return { changed: false };
        const sessions = target.sessions.length;
        target.twoFactor = false;
        target.sessions = [];
        recordAdmin(actor, target, "two_factor_reset", reason, { sessions, tokens: 0 });
        return { changed: true };
      }
      case "links/remove": {
        const provider = body.provider;
        if (typeof provider !== "string" || !REMOVABLE_LINKS.includes(provider)) return fail(400, "invalid_request", "provider is invalid");
        if (provider === "minecraft" || provider === "teamspeak") {
          const accountId = target.links[provider] ?? null;
          if (!accountId) return { changed: false };
          delete target.links[provider];
          delete target.links[provider === "minecraft" ? "minecraftName" : "teamspeakName"];
          recordAdmin(actor, target, "link_removed", reason, { provider, accountId });
          return { changed: true };
        }
        const row = target.providers.find((p) => p.provider === provider);
        if (!row) return { changed: false };
        if (target.providers.length <= 1 && target.passkeys.length === 0) return fail(409, "last_sign_in_method", `${provider} is the only way this account signs in`);
        target.providers = target.providers.filter((p) => p !== row);
        if (provider === "discord" || provider === "steam") delete target.links[provider];
        recordAdmin(actor, target, "link_removed", reason, { provider, accountId: row.accountId });
        return { changed: true };
      }
      case "email/verify": {
        if (target.email === null) return fail(409, "no_email", "This account has no email address");
        if (target.emailVerified) return { changed: false };
        target.emailVerified = true;
        recordAdmin(actor, target, "email_verified", reason, { email: target.email });
        return { changed: true };
      }
      default:
        return fail(404, "not_found");
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const method = req.method ?? "GET";
    const app = (req.headers["x-tretu-app"] as string | undefined) ?? null;
    if (Number(req.headers["content-length"] ?? 0) > MAX_BODY_BYTES) return send(res, 413, { error: "payload_too_large" });
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = method === "GET" ? "" : Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", "http://mock");
    let body: Record<string, unknown> | null = null;
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    requests.push({ method, path: req.url ?? "/", app, body });

    const secret = app ? secrets[app] : undefined;
    const verified =
      Boolean(secret) &&
      signedPathCandidates(url).some(
        (pathWithQuery) =>
          verifySignature(secret!, {
            timestamp: String(req.headers["x-tretu-timestamp"] ?? ""),
            method,
            pathWithQuery,
            body: raw,
            signature: req.headers["x-tretu-signature"] as string | undefined,
          }).ok
      );
    if (!verified) return send(res, 401, { error: "unauthorized" });
    if (state.failWith) return send(res, state.failWith, { error: "unavailable" });

    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); // api v1 admin users {sub} …

    // Contract §2 user lookup (the platform's directory fetches unknown subs; any signed app).
    if (method === "GET" && parts[2] === "users" && parts[3]) {
      const u = users.get(parts[3]);
      return u ? send(res, 200, { sub: u.sub, username: u.username, name: u.name, picture: u.picture, locale: u.locale, roles: u.roles, locked: lockActive(u), links: u.links, createdAt: u.createdAt }) : send(res, 404, { error: "not_found" });
    }
    if (parts[2] !== "admin") return send(res, 404, { error: "not_found" });
    if (app !== "tretu-web") return send(res, 403, { error: "forbidden_app", message: "The admin API is only open to tretu.de" });

    if (method === "GET") {
      const actorSub = url.searchParams.get("actorSub");
      if (actorSub !== null) {
        const actor = resolveActor(actorSub);
        if (isFailure(actor)) return sendFailure(res, actor);
      }
      let result: unknown;
      if (parts[3] === "stats" && parts.length === 4) result = stats();
      else if (parts[3] === "legacy" && parts.length === 4) result = legacy();
      else if (parts[3] === "users" && parts.length === 4) result = search(url);
      else if (parts[3] === "users" && parts.length === 5) {
        const u = users.get(parts[4]!);
        result = u ? detail(u) : fail(404, "not_found", "No Tretu-Konto with this sub");
      } else result = fail(404, "not_found");
      return isFailure(result) ? sendFailure(res, result) : send(res, 200, result);
    }

    if (method !== "POST") return send(res, 404, { error: "not_found" });
    if (!body || typeof body.actorSub !== "string" || body.actorSub.length < 1 || body.actorSub.length > 64) return send(res, 400, { error: "invalid_request", message: "actorSub is required" });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3 || reason.length > 500) return send(res, 400, { error: "invalid_request", message: "reason must be at least 3 characters" });

    if (parts[3] === "merge" && parts.length === 4) {
      if (typeof body.from !== "string" || typeof body.into !== "string" || typeof body.dryRun !== "boolean") return send(res, 400, { error: "invalid_request", message: "from, into and dryRun are required" });
      const actor = resolveActor(body.actorSub);
      if (isFailure(actor)) return sendFailure(res, actor);
      const result = merge(actor, body, reason);
      return isFailure(result) ? sendFailure(res, result) : send(res, 200, result);
    }
    if (parts[3] !== "users" || !parts[4] || parts.length < 6) return send(res, 404, { error: "not_found" });
    if (parts.slice(5).join("/") === "lock" && body.until !== undefined && body.until !== null && typeof body.until !== "string") return send(res, 400, { error: "invalid_request", message: "until: ISO date" });
    const actor = resolveActor(body.actorSub);
    if (isFailure(actor)) return sendFailure(res, actor);
    const target = parts[4].length <= 64 ? users.get(parts[4]) : undefined;
    if (!target) return send(res, 404, { error: "not_found", message: "No Tretu-Konto with this sub" });
    const result = change(actor, target, parts.slice(5).join("/"), body, reason);
    if (isFailure(result)) return sendFailure(res, result);
    return send(res, 200, { ok: true, changed: result.changed, ...(result.extra ?? {}), user: item(target) });
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => send(res, 500, { error: "internal", message: String(error) }));
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    users,
    requests,
    get failWith() {
      return state.failWith;
    },
    set failWith(value: number | null) {
      state.failWith = value;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
