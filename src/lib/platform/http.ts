/**
 * Route wrappers for the platform API:
 * - `signedRoute`: server-to-server calls signed per contract §3 (apps → tretu.de/api/v1).
 * - `sessionRoute`: browser calls from tretu.de pages (`/api/v1/me/**`), authenticated by the session.
 */
import { z } from "zod";

import { log } from "@/lib/observability/logger";
import { getPlatformUser, type PlatformUser } from "@/lib/platform/current-user";
import { PlatformDbUnavailableError } from "@/lib/platform/db";
import { getAppConfig, intEnv } from "@/lib/platform/env";
import { PlatformError } from "@/lib/platform/errors";
import { RateLimiter } from "@/lib/platform/rate-limit";
import { HEADER_APP, HEADER_SIGNATURE, HEADER_TIMESTAMP, verifySignature } from "@/lib/platform/signing";

export const MAX_BODY_BYTES = 1024 * 1024;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export function errorResponse(
  status: number,
  code: string,
  message?: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Response {
  return json({ error: code, ...(message && message !== code ? { message } : {}), ...extra }, status, headers);
}

function zodMessage(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join(".") : "body"}: ${i.message}`)
    .join("; ");
}

/** Parses a JSON body with a zod schema; throws a 400 PlatformError on failure. */
export function parseBody<S extends z.ZodType>(raw: string, schema: S): z.infer<S> {
  let data: unknown;
  try {
    data = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new PlatformError(400, "invalid_json", "Body is not valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new PlatformError(400, "invalid_request", zodMessage(parsed.error));
  return parsed.data;
}

export function parseQuery<S extends z.ZodType>(url: URL, schema: S): z.infer<S> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) throw new PlatformError(400, "invalid_request", zodMessage(parsed.error));
  return parsed.data;
}

/** `/api/v1/users/<sub>/friends` → `/api/v1/users/:id/friends` (keeps the static route segments only). */
export function routePattern(pathname: string): string {
  const STATIC = new Set(["api", "v1", "me", "users", "wallet", "transactions", "daily", "friends", "requests", "accept", "decline", "remove", "presence", "invites", "notifications", "count", "read", "push", "settings", "teamspeak", "badges", "events"]);
  return pathname
    .split("/")
    .map((segment) => (segment === "" || STATIC.has(segment) ? segment : ":id"))
    .join("/");
}

function handleError(error: unknown, route: string): Response {
  if (error instanceof PlatformError) {
    return errorResponse(error.status, error.code, error.message, error.extra);
  }
  if (error instanceof PlatformDbUnavailableError) {
    return errorResponse(503, "platform_unavailable", "The Tretu platform is not configured.");
  }
  log("error", "platform.api.error", {
    // Path parameters (subs, ids, usernames) are not logged.
    route: routePattern(route),
    error: error instanceof Error ? error.message : String(error),
  });
  return errorResponse(500, "internal_error");
}

async function readBody(req: Request): Promise<{ bytes: Uint8Array; text: string } | Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return errorResponse(413, "payload_too_large");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return errorResponse(413, "payload_too_large");
  return { bytes, text: new TextDecoder().decode(bytes) };
}

/** Per-app limiter for signed calls (`TRETU_PLATFORM_RATE_LIMIT_PER_MIN`, default 1200/min, burst 300). */
export const appRateLimiter = new RateLimiter(
  () => intEnv("TRETU_PLATFORM_RATE_LIMIT_PER_MIN", 1200, 1),
  () => intEnv("TRETU_PLATFORM_RATE_LIMIT_BURST", 300, 1)
);

/** Per-user limiter for browser mutations (60/min, burst 30). */
export const userRateLimiter = new RateLimiter(
  () => 60,
  () => 30
);

type RouteContext<P> = { params: Promise<P> };

export type SignedContext<P> = {
  app: string;
  rawBody: string;
  url: URL;
  params: P;
};

export type SignedAuthResult = { ok: true; app: string; rawBody: string; url: URL } | { ok: false; response: Response };

/** Verifies the §3 signature of an incoming request (also used by tests). */
export async function authenticateSignedRequest(req: Request, now: Date = new Date()): Promise<SignedAuthResult> {
  const unauthorized = (): SignedAuthResult => ({ ok: false, response: errorResponse(401, "unauthorized") });
  const app = req.headers.get(HEADER_APP);
  const timestamp = req.headers.get(HEADER_TIMESTAMP);
  const signature = req.headers.get(HEADER_SIGNATURE);
  if (!app || !timestamp || !signature) return unauthorized();
  const config = getAppConfig(app);
  if (!config) return unauthorized();

  const body = await readBody(req);
  if (body instanceof Response) return { ok: false, response: body };

  const url = new URL(req.url);
  const verdict = verifySignature(
    config.secret,
    { timestamp, method: req.method, pathWithQuery: url.pathname + url.search, body: body.bytes, signature },
    now
  );
  if (!verdict.ok) return unauthorized();

  const wait = appRateLimiter.take(app, 1, now.getTime());
  if (wait > 0) {
    return { ok: false, response: errorResponse(429, "rate_limited", undefined, {}, { "retry-after": String(wait) }) };
  }
  return { ok: true, app, rawBody: body.text, url };
}

export function signedRoute<P = Record<string, never>>(
  handler: (req: Request, ctx: SignedContext<P>) => Promise<Response>
) {
  return async (req: Request, routeCtx: RouteContext<P>): Promise<Response> => {
    const url = new URL(req.url);
    try {
      const auth = await authenticateSignedRequest(req);
      if (!auth.ok) return auth.response;
      const params = (await routeCtx?.params) ?? ({} as P);
      return await handler(req, { app: auth.app, rawBody: auth.rawBody, url: auth.url, params });
    } catch (error) {
      return handleError(error, url.pathname);
    }
  };
}

export type SessionContext<P> = {
  user: PlatformUser;
  rawBody: string;
  url: URL;
  params: P;
};

/** Rejects cross-site browser mutations (CSRF): requires same-origin fetch metadata / Origin. */
function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function sessionRoute<P = Record<string, never>>(
  handler: (req: Request, ctx: SessionContext<P>) => Promise<Response>
) {
  return async (req: Request, routeCtx: RouteContext<P>): Promise<Response> => {
    const url = new URL(req.url);
    try {
      const user = await getPlatformUser();
      if (!user) return errorResponse(401, "unauthorized");
      const mutating = req.method !== "GET" && req.method !== "HEAD";
      let rawBody = "";
      if (mutating) {
        if (!isSameOrigin(req)) return errorResponse(403, "forbidden", "Cross-site request blocked.");
        const wait = userRateLimiter.take(user.sub);
        if (wait > 0) return errorResponse(429, "rate_limited", undefined, {}, { "retry-after": String(wait) });
        const body = await readBody(req);
        if (body instanceof Response) return body;
        rawBody = body.text;
      }
      const params = (await routeCtx?.params) ?? ({} as P);
      return await handler(req, { user, rawBody, url, params });
    } catch (error) {
      return handleError(error, url.pathname);
    }
  };
}
