/**
 * In-memory stand-in for the auth.tretu.de admin API (central admin spec), used by the unit tests and the
 * Playwright server. Every request must be signed per contract §3 by app `tretu-web` (checked with the
 * production verifier); mutations need `actorSub` with the `admin` role and a reason of at least 3 characters,
 * and follow the spec's refusals (self-actions, last admin, last sign-in method).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { verifySignature } from "../../src/lib/platform/signing";

export type MockUser = {
  sub: string;
  username: string | null;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  picture: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  roles: string[];
  twoFactor: boolean;
  locked: boolean;
  lockedReason: string | null;
  lockedUntil: string | null;
  links: { discord?: string; minecraft?: string; minecraftName?: string; steam?: string; teamspeak?: string };
  providers: { provider: string; accountId: string; createdAt: string }[];
  passkeys: { id: string; name: string | null; createdAt: string; lastUsedAt: string | null }[];
  sessions: { id: string; createdAt: string; expiresAt: string; ipAddress?: string; userAgent?: string; client?: string }[];
  legacyLinks: { app: string; legacyUserId: string; legacyUsername: string | null; importedAt: string; method: string }[];
  audit: { id: number; event: string; success: boolean; createdAt: string; meta?: Record<string, unknown> }[];
};

export type RecordedRequest = { method: string; path: string; app: string | null; body: Record<string, unknown> | null };

export function mockUser(partial: Partial<MockUser> & { sub: string }): MockUser {
  return {
    username: null,
    name: null,
    email: null,
    emailVerified: false,
    picture: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: null,
    roles: [],
    twoFactor: false,
    locked: false,
    lockedReason: null,
    lockedUntil: null,
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
  /** Answer every request with this status (e.g. 503) until reset to null. */
  failWith: number | null;
  close(): Promise<void>;
};

function summary(u: MockUser) {
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
    locked: u.locked,
    links: u.links,
  };
}

function detail(u: MockUser) {
  return { ...summary(u), emailVerified: u.emailVerified, providers: u.providers, passkeys: u.passkeys, sessions: u.sessions, legacyLinks: u.legacyLinks, audit: u.audit.slice(-50).reverse(), lockedReason: u.lockedReason, lockedUntil: u.lockedUntil };
}

function identifiers(u: MockUser): string[] {
  return [u.sub, u.username, u.name, u.email, u.links.discord, u.links.minecraft, u.links.minecraftName, u.links.steam, u.links.teamspeak]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());
}

export async function startMockAuth(options: { secret: string; users?: MockUser[]; port?: number }): Promise<MockAuth> {
  const users = new Map((options.users ?? []).map((u) => [u.sub, u]));
  const requests: RecordedRequest[] = [];
  let auditId = 1;
  const state: { failWith: number | null } = { failWith: null };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const audit = (u: MockUser, event: string, meta: Record<string, unknown>) =>
    u.audit.push({ id: auditId++, event, success: true, createdAt: new Date().toISOString(), meta });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const method = req.method ?? "GET";
    const pathWithQuery = req.url ?? "/";
    const app = (req.headers["x-tretu-app"] as string | undefined) ?? null;
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    requests.push({ method, path: pathWithQuery, app, body });

    const verified =
      app === "tretu-web" &&
      verifySignature(options.secret, {
        timestamp: String(req.headers["x-tretu-timestamp"] ?? ""),
        method,
        pathWithQuery,
        body: raw,
        signature: req.headers["x-tretu-signature"] as string | undefined,
      }).ok;
    if (!verified) return send(res, 401, { error: "unauthorized" });
    if (state.failWith) return send(res, state.failWith, { error: "unavailable" });

    const url = new URL(pathWithQuery, "http://mock");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); // api v1 admin users {sub} …

    // Contract §2 user lookup (the platform's directory fetches unknown subs).
    if (method === "GET" && parts[2] === "users" && parts[3]) {
      const u = users.get(parts[3]);
      return u ? send(res, 200, { ...summary(u), locale: "de" }) : send(res, 404, { error: "not_found" });
    }
    if (parts[2] !== "admin") return send(res, 404, { error: "not_found" });

    if (method === "GET") {
      if (parts[3] === "stats") {
        const all = [...users.values()];
        return send(res, 200, {
          users: {
            total: all.length,
            verified: all.filter((u) => u.emailVerified).length,
            withTwoFactor: all.filter((u) => u.twoFactor).length,
            locked: all.filter((u) => u.locked).length,
            admins: all.filter((u) => u.roles.includes("admin")).length,
          },
          signUpsPerDay: [{ day: "2026-10-30", count: 2 }, { day: "2026-10-31", count: 1 }],
          signInsPerDay: [{ day: "2026-10-30", count: 5 }, { day: "2026-10-31", count: 7 }],
          providers: { password: 2, discord: 1, google: 0, apple: 0, steam: 1, passkey: 0 },
        });
      }
      if (parts[3] === "legacy") {
        const items = [...users.values()]
          .filter((u) => u.legacyLinks.length && !u.legacyLinks.some((l) => l.method === "admin"))
          .map((u) => ({
            account: { id: u.sub, username: u.username, email: u.email, createdAt: u.createdAt, legacy: u.legacyLinks },
            possibleMatches: [...users.values()]
              .filter((o) => o.sub !== u.sub && o.email && o.email === u.email)
              .map((o) => ({ id: o.sub, username: o.username, email: o.email, reasons: ["email"] })),
          }));
        return send(res, 200, { items });
      }
      if (parts[3] === "users" && parts[4]) {
        const u = users.get(parts[4]);
        return u ? send(res, 200, detail(u)) : send(res, 404, { error: "not_found" });
      }
      if (parts[3] === "users") {
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const limit = Number(url.searchParams.get("limit") ?? 50);
        const offset = Number(url.searchParams.get("cursor") ?? 0);
        const hits = [...users.values()].filter((u) => identifiers(u).some((id) => id.includes(q)));
        const page = hits.slice(offset, offset + limit);
        return send(res, 200, { items: page.map(summary), nextCursor: offset + limit < hits.length ? String(offset + limit) : null });
      }
      return send(res, 404, { error: "not_found" });
    }

    // Mutations.
    if (method !== "POST" || !body) return send(res, 400, { error: "invalid_request" });
    const actor = typeof body.actorSub === "string" ? users.get(body.actorSub) : undefined;
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) return send(res, 400, { error: "invalid_request", message: "reason" });
    if (!actor || !actor.roles.includes("admin")) return send(res, 403, { error: "forbidden", message: "actor is not an admin" });

    if (parts[3] === "merge") {
      const from = users.get(String(body.from));
      const into = users.get(String(body.into));
      if (!from || !into) return send(res, 404, { error: "not_found" });
      if (from.sub === into.sub) return send(res, 409, { error: "conflict", message: "same account" });
      const intoProviders = new Set(into.providers.map((p) => p.provider));
      const plan = {
        from: { id: from.sub, username: from.username },
        into: { id: into.sub, username: into.username },
        move: {
          providers: from.providers.filter((p) => !intoProviders.has(p.provider)).map((p) => ({ providerId: p.provider })),
          gameLinks: [],
          passkeys: from.passkeys,
          legacy: from.legacyLinks,
        },
        drop: { providers: from.providers.filter((p) => intoProviders.has(p.provider)).map((p) => ({ providerId: p.provider })), gameLinks: [] },
      };
      if (body.dryRun) return send(res, 200, { dryRun: true, plan });
      into.legacyLinks.push(...from.legacyLinks.map((l) => ({ ...l, method: "admin" })));
      users.delete(from.sub);
      audit(into, "admin.merge", { by: actor.sub, from: from.sub, reason: body.reason });
      return send(res, 200, { plan, after: detail(into) });
    }

    const target = parts[3] === "users" && parts[4] ? users.get(parts[4]) : undefined;
    if (!target) return send(res, 404, { error: "not_found" });
    const action = parts.slice(5).join("/");
    const admins = [...users.values()].filter((u) => u.roles.includes("admin"));
    switch (action) {
      case "roles": {
        const add = (body.add as string[] | undefined) ?? [];
        const remove = (body.remove as string[] | undefined) ?? [];
        if (target.sub === actor.sub && remove.includes("admin")) return send(res, 403, { error: "self_action" });
        target.roles = [...new Set([...target.roles.filter((r) => !remove.includes(r)), ...add])];
        break;
      }
      case "sessions/revoke":
        target.sessions = [];
        break;
      case "lock":
        if (target.sub === actor.sub) return send(res, 403, { error: "self_action" });
        if (target.roles.includes("admin") && admins.length <= 1) return send(res, 403, { error: "last_admin" });
        target.locked = true;
        target.lockedReason = body.reason as string;
        target.lockedUntil = typeof body.until === "string" ? body.until : null;
        target.sessions = [];
        break;
      case "unlock":
        target.locked = false;
        target.lockedReason = null;
        target.lockedUntil = null;
        break;
      case "two-factor/reset":
        target.twoFactor = false;
        target.sessions = [];
        break;
      case "links/remove": {
        const provider = String(body.provider);
        const isProvider = target.providers.some((p) => p.provider === provider);
        if (isProvider && target.providers.length <= 1) return send(res, 409, { error: "last_sign_in_method" });
        if (!isProvider && !(provider in target.links)) return send(res, 404, { error: "not_linked" });
        target.providers = target.providers.filter((p) => p.provider !== provider);
        delete (target.links as Record<string, string>)[provider];
        break;
      }
      case "email/verify":
        target.emailVerified = true;
        break;
      default:
        return send(res, 404, { error: "not_found" });
    }
    audit(target, `admin.${action.replace("/", ".")}`, { by: actor.sub, reason: body.reason });
    return send(res, 200, { ok: true, user: detail(target) });
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
