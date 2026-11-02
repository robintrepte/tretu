/**
 * Structured JSON logs (one line per entry, collected by PM2 / pm2-logrotate).
 *
 * Never log secrets or personal data. As a safety net, values under keys that look like credentials or
 * contact data are replaced by "[redacted]", strings are capped at 1000 characters and anything that
 * looks like a bearer token, a signature or an email address inside a message is masked.
 */
type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY = /secret|token|password|passwd|authorization|cookie|signature|api[-_]?key|private|session|email|^ip$|address/i;
const MAX_STRING = 1000;

function maskString(value: string): string {
  const masked = value
    .replace(/\b(Bot|Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [redacted]")
    .replace(/\bv1=[0-9a-f]{64}\b/g, "v1=[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(postgres(?:ql)?:\/\/)[^@\s/]+@/g, "$1***@");
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…` : masked;
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return maskString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 4) return "[nested]";
  if (value instanceof Error) return maskString(value.message);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

export function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  console[level](
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(redact(meta) as Record<string, unknown>),
    })
  );
}
