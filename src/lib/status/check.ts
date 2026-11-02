/**
 * One health check of one service (contract §0 `GET /api/health`), run by the platform worker.
 *
 * - `up`: HTTP 2xx and JSON `"status":"ok"` within {@link SLOW_MS}.
 * - `degraded`: the service answers but is not healthy: a health JSON with another status (any HTTP code,
 *   e.g. `503 {"status":"error","checks":{"db":"error"}}`), a 2xx without valid health JSON, or a slow answer.
 * - `down`: no answer within the timeout, no connection, or an error page without health JSON (e.g. nginx 502).
 */
import type { HttpTarget } from "@/lib/status/targets";

export type ServiceState = "up" | "degraded" | "down";

export type CheckResult = {
  state: ServiceState;
  /** Time until the response body was read; null without an answer. */
  responseMs: number | null;
  httpStatus: number | null;
  /** Short code for the reason when not `up`: `timeout`, `connection`, `http_502`, `invalid_json`, `slow`, `checks:db`, `status:<s>`, `invalid_response`. */
  error: string | null;
  /** Game servers: players / users online and slots (null when unknown). */
  usersOnline?: number | null;
  usersMax?: number | null;
};

export const CHECK_TIMEOUT_MS = 5_000;
/** An answer slower than this counts as disturbed. */
export const SLOW_MS = 3_000;
/** Bodies are cut off here: a health answer is a few hundred bytes. */
const MAX_BODY_BYTES = 64 * 1024;
export const STATUS_USER_AGENT = "TretuStatus/1.0 (+https://tretu.de/status)";

type HealthJson = { status?: unknown; checks?: unknown };

function parseHealth(body: string): HealthJson | null {
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) && typeof (value as HealthJson).status === "string"
      ? (value as HealthJson)
      : null;
  } catch {
    return null;
  }
}

/** Names of failing sub-checks (`{"checks":{"db":"error"}}` → `db`), for alerts and logs. */
function failingChecks(health: HealthJson): string[] {
  if (!health.checks || typeof health.checks !== "object") return [];
  return Object.entries(health.checks as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && v !== "ok" && v !== "off")
    .map(([k]) => k.replace(/[^a-z0-9_-]/gi, "").slice(0, 20))
    .filter(Boolean)
    .slice(0, 5);
}

/** Pure classification of an answer (exported for tests). */
export function classifyResponse(httpStatus: number, body: string, responseMs: number): CheckResult {
  const health = parseHealth(body);
  const ok2xx = httpStatus >= 200 && httpStatus < 300;
  if (health) {
    if (health.status === "ok" && ok2xx) {
      return responseMs > SLOW_MS
        ? { state: "degraded", responseMs, httpStatus, error: "slow" }
        : { state: "up", responseMs, httpStatus, error: null };
    }
    const failing = failingChecks(health);
    const status = String(health.status).replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "unknown";
    return { state: "degraded", responseMs, httpStatus, error: failing.length ? `checks:${failing.join(",")}` : `status:${status}` };
  }
  if (ok2xx) return { state: "degraded", responseMs, httpStatus, error: "invalid_json" };
  return { state: "down", responseMs, httpStatus, error: `http_${httpStatus}` };
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES).toString("utf8");
}

export type CheckOptions = {
  timeoutMs?: number;
  /** Aborts the check early (worker shutdown); such a check is reported as `timeout`. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

/** Requests `target.url` once. Never throws. */
export async function checkTarget(target: Pick<HttpTarget, "url">, options: CheckOptions = {}): Promise<CheckResult> {
  const timeoutMs = options.timeoutMs ?? CHECK_TIMEOUT_MS;
  const signals = [AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])];
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0]!;
  const started = performance.now();
  try {
    const response = await (options.fetchImpl ?? fetch)(target.url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": STATUS_USER_AGENT, "cache-control": "no-cache" },
      redirect: "follow",
      signal,
    });
    const body = await readLimited(response);
    return classifyResponse(response.status, body, Math.round(performance.now() - started));
  } catch (error) {
    const aborted = signal.aborted || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"));
    return { state: "down", responseMs: null, httpStatus: null, error: aborted ? "timeout" : "connection" };
  }
}
